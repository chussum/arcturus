import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import { AppConfig } from '../../common/config/app-config';
import { SessionsRepository } from '../../infrastructure/persistence/repositories/sessions.repository.port';

export interface SessionPayload {
  userId: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issues and verifies the JWT stored in the dashboard's httpOnly cookie.
 * Each token carries a `jti` backed by a sessions row, so a logout (or an
 * admin deleting the row) revokes it immediately instead of leaving the
 * signature valid until expiry.
 */
@Injectable()
export class SessionService {
  static readonly cookieName = 'arcturus_session';

  private readonly secret: Uint8Array;

  constructor(
    config: AppConfig,
    private readonly sessions: SessionsRepository,
  ) {
    this.secret = new TextEncoder().encode(resolveSecret(config));
  }

  async issue(payload: SessionPayload): Promise<string> {
    const jti = nanoid();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.sessions.create({
      id: jti,
      userId: payload.userId,
      expiresAt: expiresAt.toISOString(),
    });
    // Logins are rare; piggyback garbage collection of naturally-expired rows.
    await this.sessions.deleteExpired(new Date().toISOString());

    return new SignJWT({ sub: payload.userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.secret);
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') return null;
      if (!(await this.sessions.exists(payload.jti))) return null;
      return { userId: payload.sub };
    } catch {
      return null;
    }
  }

  /** Deletes the session row behind a token; tolerates garbage input (revoking is idempotent). */
  async revoke(token: string): Promise<void> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] });
      if (typeof payload.jti === 'string') await this.sessions.delete(payload.jti);
    } catch {
      // Expired or forged token — nothing server-side to revoke.
    }
  }
}

/**
 * Use the configured secret when provided; otherwise generate one once and
 * keep it on disk so sessions survive server restarts.
 */
function resolveSecret(config: AppConfig): string {
  if (config.jwtSecret) return config.jwtSecret;

  if (config.isProduction) {
    throw new Error(
      'ARCTURUS_JWT_SECRET must be set in production. Refusing to fall back to the plaintext ' +
        'data/jwt-secret file — a leaked file would let anyone forge sessions. Run `bun run secrets:init`.',
    );
  }

  new Logger(SessionService.name).warn(
    'ARCTURUS_JWT_SECRET is not set — falling back to the PLAINTEXT key file data/jwt-secret. ' +
      'Run `bun run secrets:init` (macOS) to move it into an encrypted .env.secrets + Keychain.',
  );
  const secretFile = path.join(config.dataDir, 'jwt-secret');
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf8').trim();
  }
  const generated = nanoid(64);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}
