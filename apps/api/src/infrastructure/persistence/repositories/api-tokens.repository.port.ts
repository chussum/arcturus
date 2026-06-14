import type { ApiTokenRow } from '../drizzle/schema';

export interface CreateApiTokenData {
  userId: string;
  tokenHash: string;
  name: string;
  /** ISO expiry timestamp; null means the token never expires. */
  expiresAt: string | null;
}

export abstract class ApiTokensRepository {
  abstract findByHash(tokenHash: string): Promise<ApiTokenRow | null>;
  abstract listByUser(userId: string): Promise<ApiTokenRow[]>;
  abstract create(data: CreateApiTokenData): Promise<ApiTokenRow>;
  abstract touchLastUsed(id: string): Promise<void>;
  abstract delete(id: string, userId: string): Promise<void>;
}
