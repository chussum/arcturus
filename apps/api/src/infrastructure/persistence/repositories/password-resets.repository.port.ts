import type { PasswordResetRow } from '../drizzle/schema';

export interface CreatePasswordResetData {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
}

export abstract class PasswordResetsRepository {
  abstract create(data: CreatePasswordResetData): Promise<PasswordResetRow>;
  abstract findByHash(tokenHash: string): Promise<PasswordResetRow | null>;
  /**
   * Atomically marks a reset token as used. Returns false if already used.
   * Mirror the invites.markUsed pattern (conditional update + re-read).
   */
  abstract markUsed(id: string): Promise<boolean>;
}
