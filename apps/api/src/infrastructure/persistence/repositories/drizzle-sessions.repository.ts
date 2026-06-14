import { Inject, Injectable } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { sessions } from '../drizzle/schema';
import type { CreateSessionData } from './sessions.repository.port';
import { SessionsRepository } from './sessions.repository.port';

@Injectable()
export class DrizzleSessionsRepository extends SessionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {
    super();
  }

  async create(data: CreateSessionData): Promise<void> {
    await this.db.insert(sessions).values({
      id: data.id,
      userId: data.userId,
      expiresAt: data.expiresAt,
      createdAt: new Date().toISOString(),
    });
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, id));
    return row !== undefined;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteExpired(now: string): Promise<void> {
    await this.db.delete(sessions).where(lt(sessions.expiresAt, now));
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }
}
