import { AppStatus } from '@arcturus/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { type AppRow, apps } from '../drizzle/schema';
import type { CreateAppData, UpdateAppData } from './apps.repository.port';
import { AppsRepository } from './apps.repository.port';

@Injectable()
export class DrizzleAppsRepository extends AppsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {
    super();
  }

  async findById(id: string): Promise<AppRow | null> {
    const [row] = await this.db.select().from(apps).where(eq(apps.id, id));
    return row ?? null;
  }

  async findByOwnerAndName(userId: string, name: string): Promise<AppRow | null> {
    const [row] = await this.db
      .select()
      .from(apps)
      .where(and(eq(apps.userId, userId), eq(apps.name, name)));
    return row ?? null;
  }

  async list(): Promise<AppRow[]> {
    return this.db.select().from(apps).orderBy(apps.createdAt);
  }

  async listByUser(userId: string): Promise<AppRow[]> {
    return this.db.select().from(apps).where(eq(apps.userId, userId)).orderBy(apps.createdAt);
  }

  async create(data: CreateAppData): Promise<AppRow> {
    const row: AppRow = {
      id: nanoid(),
      userId: data.userId,
      name: data.name,
      description: data.description ?? null,
      type: data.type,
      status: AppStatus.Idle,
      routeMode: data.routeMode ?? 'proxy',
      assignedPort: data.assignedPort,
      containerId: null,
      activeDeploymentId: null,
      env: data.env ?? '{}',
      memoryLimitMb: null,
      createdAt: new Date().toISOString(),
      lastDeployedAt: null,
      sharedAllRole: null,
    };
    await this.db.insert(apps).values(row);
    return row;
  }

  async update(id: string, data: UpdateAppData): Promise<void> {
    await this.db.update(apps).set(data).where(eq(apps.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(apps).where(eq(apps.id, id));
  }

  async listSharedWithEveryone(): Promise<AppRow[]> {
    return this.db.select().from(apps).where(isNotNull(apps.sharedAllRole)).orderBy(apps.createdAt);
  }

  async listByIds(ids: string[]): Promise<AppRow[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(apps).where(inArray(apps.id, ids)).orderBy(apps.createdAt);
  }

  async listAssignedPorts(): Promise<number[]> {
    const rows = await this.db
      .select({ port: apps.assignedPort })
      .from(apps)
      .where(isNotNull(apps.assignedPort));
    return rows.map((row) => row.port).filter((port): port is number => port !== null);
  }
}
