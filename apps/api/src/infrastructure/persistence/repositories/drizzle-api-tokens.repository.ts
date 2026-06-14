import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { type ApiTokenRow, apiTokens } from '../drizzle/schema';
import type { CreateApiTokenData } from './api-tokens.repository.port';
import { ApiTokensRepository } from './api-tokens.repository.port';

@Injectable()
export class DrizzleApiTokensRepository extends ApiTokensRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {
    super();
  }

  async findByHash(tokenHash: string): Promise<ApiTokenRow | null> {
    const [row] = await this.db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash));
    return row ?? null;
  }

  async listByUser(userId: string): Promise<ApiTokenRow[]> {
    return this.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId))
      .orderBy(desc(apiTokens.createdAt));
  }

  async create(data: CreateApiTokenData): Promise<ApiTokenRow> {
    const row: ApiTokenRow = {
      id: nanoid(),
      userId: data.userId,
      tokenHash: data.tokenHash,
      name: data.name,
      lastUsedAt: null,
      expiresAt: data.expiresAt,
      createdAt: new Date().toISOString(),
    };
    await this.db.insert(apiTokens).values(row);
    return row;
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.db
      .update(apiTokens)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiTokens.id, id));
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
  }
}
