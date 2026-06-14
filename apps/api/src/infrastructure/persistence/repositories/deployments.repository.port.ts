import type { DeploymentStatus } from '@arcturus/shared';
import type { DeploymentRow } from '../drizzle/schema';

export abstract class DeploymentsRepository {
  abstract findById(id: string): Promise<DeploymentRow | null>;
  abstract listByApp(appId: string): Promise<DeploymentRow[]>;
  abstract create(appId: string): Promise<DeploymentRow>;
  abstract setStatus(id: string, status: DeploymentStatus, finishedAt?: string): Promise<void>;
  abstract appendBuildLog(id: string, chunk: string): Promise<void>;
}
