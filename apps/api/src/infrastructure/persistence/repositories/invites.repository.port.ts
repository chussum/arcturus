import type { InviteRow } from '../drizzle/schema';

export interface CreateInviteData {
  code: string;
  memo: string | null;
  createdBy: string;
  expiresAt: string;
}

export abstract class InvitesRepository {
  abstract findByCode(code: string): Promise<InviteRow | null>;
  abstract list(): Promise<InviteRow[]>;
  abstract create(data: CreateInviteData): Promise<InviteRow>;
  /**
   * Atomically claims an unused invite for `usedBy`. Returns false when the
   * invite was already taken (e.g. a concurrent signup won the race).
   */
  abstract markUsed(id: string, usedBy: string): Promise<boolean>;
  abstract delete(id: string): Promise<void>;
}
