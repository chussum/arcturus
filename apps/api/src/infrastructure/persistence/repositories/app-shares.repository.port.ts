import type { ShareRole } from '@arcturus/shared';
import type { AppShareRow } from '../drizzle/schema';

export interface AppShareEntry {
  userId: string;
  role: ShareRole;
}

export abstract class AppSharesRepository {
  abstract listByApp(appId: string): Promise<AppShareRow[]>;
  abstract listByUser(userId: string): Promise<AppShareRow[]>;
  abstract findByAppAndUser(appId: string, userId: string): Promise<AppShareRow | null>;
  abstract replaceForApp(appId: string, entries: AppShareEntry[]): Promise<void>;
}
