import type { CreateTokenResponse, TokenSummary } from '@arcturus/shared';
import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { LocalizedBadRequest } from '../../common/i18n/localized.exception';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { ApiTokensRepository } from '../../infrastructure/persistence/repositories/api-tokens.repository.port';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';

const TOKEN_PREFIX = 'arc_';

/** Expiry presets the dashboard offers (in days); null = never expires. */
const ALLOWED_EXPIRY_DAYS = new Set([30, 90, 365]);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Issues and authenticates the long-lived bearer tokens used by the CLI. */
@Injectable()
export class ApiTokenService {
  constructor(
    private readonly tokens: ApiTokensRepository,
    private readonly users: UsersRepository,
  ) {}

  async issue(
    userId: string,
    name: string,
    expiresInDays?: number | null,
  ): Promise<CreateTokenResponse> {
    const expiresAt = resolveExpiry(expiresInDays);
    const plaintext = `${TOKEN_PREFIX}${nanoid(40)}`;
    const row = await this.tokens.create({
      userId,
      name,
      tokenHash: hashToken(plaintext),
      expiresAt,
    });
    // The plaintext leaves the server exactly once, in this response.
    return { id: row.id, name: row.name, token: plaintext, expiresAt: row.expiresAt };
  }

  async authenticate(plaintext: string): Promise<UserRow | null> {
    if (!plaintext.startsWith(TOKEN_PREFIX)) return null;
    const row = await this.tokens.findByHash(hashToken(plaintext));
    if (!row) return null;
    // Reject an expired token instead of authenticating with it.
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return null;
    await this.tokens.touchLastUsed(row.id);
    return this.users.findById(row.userId);
  }

  async listForUser(userId: string): Promise<TokenSummary[]> {
    const rows = await this.tokens.listByUser(userId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }));
  }

  async revoke(id: string, userId: string): Promise<void> {
    await this.tokens.delete(id, userId);
  }
}

function hashToken(plaintext: string): string {
  return new Bun.CryptoHasher('sha256').update(plaintext).digest('hex');
}

/** Turns a requested expiry (days) into an ISO timestamp, or null for never. */
function resolveExpiry(expiresInDays?: number | null): string | null {
  if (expiresInDays === undefined || expiresInDays === null) return null;
  if (!ALLOWED_EXPIRY_DAYS.has(expiresInDays)) {
    throw new LocalizedBadRequest('tokens.expiresInDaysInvalid', {
      allowed: [...ALLOWED_EXPIRY_DAYS].join(', '),
    });
  }
  return new Date(Date.now() + expiresInDays * DAY_MS).toISOString();
}
