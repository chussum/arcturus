import { DeploymentStatus } from '@arcturus/shared';
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { DRIZZLE, type DrizzleDb } from '../drizzle/database.module';
import { type DeploymentRow, deployments } from '../drizzle/schema';
import { DeploymentsRepository } from './deployments.repository.port';

/**
 * A deployment id doubles as the Docker image tag (see `imageTagFor`). Docker
 * tags must begin with an alphanumeric and cannot contain the `-`/`_` that
 * nanoid's default URL-safe alphabet may place at the start or end — such a tag
 * builds fine but `docker create` then rejects the reference with "invalid
 * reference format" (HTTP 400). Restricting the id to alphanumerics keeps every
 * derived tag valid. 21 characters preserves nanoid's default collision margin.
 */
export const generateDeploymentId = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  21,
);

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
      id: generateDeploymentId(),
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
