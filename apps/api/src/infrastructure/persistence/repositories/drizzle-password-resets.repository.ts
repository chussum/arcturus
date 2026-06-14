import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { type PasswordResetRow, passwordResets } from '../drizzle/schema';
import type { CreatePasswordResetData } from './password-resets.repository.port';
import { PasswordResetsRepository } from './password-resets.repository.port';

@Injectable()
export class DrizzlePasswordResetsRepository extends PasswordResetsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {
    super();
  }

  async create(data: CreatePasswordResetData): Promise<PasswordResetRow> {
    const row: PasswordResetRow = {
      id: data.id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      usedAt: null,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
    };
    await this.db.insert(passwordResets).values(row);
    return row;
  }

  async findByHash(tokenHash: string): Promise<PasswordResetRow | null> {
    const [row] = await this.db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, tokenHash));
    return row ?? null;
  }

  async markUsed(id: string): Promise<boolean> {
    const usedAt = new Date().toISOString();
    // Conditional update is the atomic claim; the re-read tells us who won.
    await this.db
      .update(passwordResets)
      .set({ usedAt })
      .where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt)));
    const [row] = await this.db.select().from(passwordResets).where(eq(passwordResets.id, id));
    return row?.usedAt !== null;
  }
}
