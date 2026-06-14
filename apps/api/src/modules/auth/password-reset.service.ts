import type { CreateResetLinkResponse, ResetTokenInfo } from '@arcturus/shared';
import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { LocalizedBadRequest } from '../../common/i18n/localized.exception';
import { PasswordResetsRepository } from '../../infrastructure/persistence/repositories/password-resets.repository.port';
import { SessionsRepository } from '../../infrastructure/persistence/repositories/sessions.repository.port';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';
import { PasswordService } from './password.service';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly resets: PasswordResetsRepository,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwords: PasswordService,
  ) {}

  async createLink(targetUserId: string, createdById: string): Promise<CreateResetLinkResponse> {
    const plaintext = nanoid(40);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
    await this.resets.create({
      id: nanoid(),
      userId: targetUserId,
      tokenHash: hashToken(plaintext),
      expiresAt,
      createdBy: createdById,
      createdAt: new Date().toISOString(),
    });
    return { token: plaintext, expiresAt };
  }

  async info(token: string): Promise<ResetTokenInfo> {
    const row = await this.findValidRow(token);
    const user = await this.users.findById(row.userId);
    if (!user) throw new LocalizedBadRequest('auth.resetTokenInvalid');
    return { username: user.username };
  }

  async consume(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new LocalizedBadRequest('auth.passwordTooShort');
    const row = await this.findValidRow(token);
    const hash = await this.passwords.hash(newPassword);
    await this.users.updatePassword(row.userId, hash);
    await this.resets.markUsed(row.id);
    await this.sessions.deleteByUser(row.userId);
  }

  private async findValidRow(token: string) {
    const row = await this.resets.findByHash(hashToken(token));
    if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) {
      throw new LocalizedBadRequest('auth.resetTokenInvalid');
    }
    return row;
  }
}

function hashToken(plaintext: string): string {
  return new Bun.CryptoHasher('sha256').update(plaintext).digest('hex');
}
