import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { type InviteRow, invites } from '../drizzle/schema';
import type { CreateInviteData } from './invites.repository.port';
import { InvitesRepository } from './invites.repository.port';

@Injectable()
export class DrizzleInvitesRepository extends InvitesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {
    super();
  }

  async findByCode(code: string): Promise<InviteRow | null> {
    const [row] = await this.db.select().from(invites).where(eq(invites.code, code));
    return row ?? null;
  }

  async list(): Promise<InviteRow[]> {
    return this.db.select().from(invites).orderBy(desc(invites.createdAt));
  }

  async create(data: CreateInviteData): Promise<InviteRow> {
    const row: InviteRow = {
      id: nanoid(),
      code: data.code,
      memo: data.memo,
      createdBy: data.createdBy,
      usedBy: null,
      expiresAt: data.expiresAt,
      createdAt: new Date().toISOString(),
    };
    await this.db.insert(invites).values(row);
    return row;
  }

  async markUsed(id: string, usedBy: string): Promise<boolean> {
    // Conditional update is the atomic claim; the re-read tells us who won.
    await this.db
      .update(invites)
      .set({ usedBy })
      .where(and(eq(invites.id, id), isNull(invites.usedBy)));
    const [row] = await this.db.select().from(invites).where(eq(invites.id, id));
    return row?.usedBy === usedBy;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(invites).where(eq(invites.id, id));
  }
}
