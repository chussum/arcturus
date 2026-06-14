import { UserRole } from '@arcturus/shared';
import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { type UserRow, users } from '../drizzle/schema';
import type { CreateUserData } from './users.repository.port';
import { UsersRepository } from './users.repository.port';

@Injectable()
export class DrizzleUsersRepository extends UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {
    super();
  }

  async findById(id: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row ?? null;
  }

  async findByUsername(username: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username));
    return row ?? null;
  }

  async list(): Promise<UserRow[]> {
    return this.db.select().from(users).orderBy(users.createdAt);
  }

  async create(data: CreateUserData): Promise<UserRow> {
    const row: UserRow = {
      id: nanoid(),
      username: data.username,
      passwordHash: data.passwordHash,
      role: data.role,
      createdAt: new Date().toISOString(),
    };
    await this.db.insert(users).values(row);
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }

  async countAdmins(): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, UserRole.Admin));
    return row?.value ?? 0;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }
}
