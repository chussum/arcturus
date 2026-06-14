import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { type AppShareRow, appShares } from '../drizzle/schema';
import type { AppShareEntry } from './app-shares.repository.port';
import { AppSharesRepository } from './app-shares.repository.port';

@Injectable()
export class DrizzleAppSharesRepository extends AppSharesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {
    super();
  }

  async listByApp(appId: string): Promise<AppShareRow[]> {
    return this.db.select().from(appShares).where(eq(appShares.appId, appId));
  }

  async listByUser(userId: string): Promise<AppShareRow[]> {
    return this.db.select().from(appShares).where(eq(appShares.userId, userId));
  }

  async findByAppAndUser(appId: string, userId: string): Promise<AppShareRow | null> {
    const [row] = await this.db
      .select()
      .from(appShares)
      .where(and(eq(appShares.appId, appId), eq(appShares.userId, userId)));
    return row ?? null;
  }

  async replaceForApp(appId: string, entries: AppShareEntry[]): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(appShares).where(eq(appShares.appId, appId)).run();
      for (const entry of entries) {
        tx.insert(appShares)
          .values({
            id: nanoid(),
            appId,
            userId: entry.userId,
            role: entry.role,
            createdAt: new Date().toISOString(),
          })
          .run();
      }
    });
  }
}
