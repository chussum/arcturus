import type { AppStatus, AppType, RouteMode, ShareRole } from '@arcturus/shared';
import type { AppRow } from '../drizzle/schema';

export interface CreateAppData {
  userId: string;
  name: string;
  description?: string | null;
  type: AppType;
  routeMode?: RouteMode;
  assignedPort: number | null;
  /** Serialized + encrypted JSON env, set at creation; omit for the default '{}'. */
  env?: string;
}

export interface UpdateAppData {
  status?: AppStatus;
  routeMode?: RouteMode;
  description?: string | null;
  containerId?: string | null;
  assignedPort?: number | null;
  activeDeploymentId?: string | null;
  /** Serialized JSON object of user env vars. */
  env?: string;
  /** Per-app container memory cap in MB; null clears it back to the server default. */
  memoryLimitMb?: number | null;
  lastDeployedAt?: string;
  sharedAllRole?: ShareRole | null;
}

export abstract class AppsRepository {
  abstract findById(id: string): Promise<AppRow | null>;
  abstract findByOwnerAndName(userId: string, name: string): Promise<AppRow | null>;
  abstract list(): Promise<AppRow[]>;
  abstract listByUser(userId: string): Promise<AppRow[]>;
  abstract create(data: CreateAppData): Promise<AppRow>;
  abstract update(id: string, data: UpdateAppData): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract listAssignedPorts(): Promise<number[]>;
  abstract listSharedWithEveryone(): Promise<AppRow[]>;
  abstract listByIds(ids: string[]): Promise<AppRow[]>;
}
