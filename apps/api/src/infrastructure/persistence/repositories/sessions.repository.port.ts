export interface CreateSessionData {
  /** The JWT's `jti` claim. */
  id: string;
  userId: string;
  /** ISO timestamp; used to garbage-collect rows for tokens that expired on their own. */
  expiresAt: string;
}

export abstract class SessionsRepository {
  abstract create(data: CreateSessionData): Promise<void>;
  abstract exists(id: string): Promise<boolean>;
  abstract delete(id: string): Promise<void>;
  abstract deleteExpired(now: string): Promise<void>;
  /** Deletes all sessions for a user — called after password change/reset to revoke all devices. */
  abstract deleteByUser(userId: string): Promise<void>;
}
