import { DeploymentStatus } from '@arcturus/shared';
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { type DeploymentRow, deployments } from '../drizzle/schema';
import { DeploymentsRepository } from './deployments.repository.port';

@Injectable()
export class DrizzleDeploymentsRepository extends DeploymentsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {
    super();
  }

  async findById(id: string): Promise<DeploymentRow | null> {
    const [row] = await this.db.select().from(deployments).where(eq(deployments.id, id));
    return row ?? null;
  }

  async listByApp(appId: string): Promise<DeploymentRow[]> {
    return this.db
      .select()
      .from(deployments)
      .where(eq(deployments.appId, appId))
      .orderBy(desc(deployments.createdAt));
  }

  async create(appId: string): Promise<DeploymentRow> {
    const row: DeploymentRow = {
      id: nanoid(),
      appId,
      status: DeploymentStatus.Queued,
      buildLog: '',
      finishedAt: null,
      createdAt: new Date().toISOString(),
    };
    await this.db.insert(deployments).values(row);
    return row;
  }

  async setStatus(id: string, status: DeploymentStatus, finishedAt?: string): Promise<void> {
    await this.db
      .update(deployments)
      .set(finishedAt ? { status, finishedAt } : { status })
      .where(eq(deployments.id, id));
  }

  async appendBuildLog(id: string, chunk: string): Promise<void> {
    await this.db
      .update(deployments)
      .set({ buildLog: sql`${deployments.buildLog} || ${chunk}` })
      .where(eq(deployments.id, id));
  }
}
