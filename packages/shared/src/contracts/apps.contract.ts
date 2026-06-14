import type { AppStatus } from '../enums/app-status';
import type { AppType } from '../enums/app-type';
import type { RouteMode } from '../enums/route-mode';
import type { ShareRole } from '../enums/share-role';

export interface AppSummary {
  id: string;
  /** Owner's username — first segment of the public URL. */
  ownerUsername: string;
  name: string;
  /** Optional human description shown under the app name. */
  description: string | null;
  type: AppType;
  status: AppStatus;
  routeMode: RouteMode;
  /** Dedicated host port for container apps; null for static sites. */
  assignedPort: number | null;
  /** Public path under the gateway, e.g. "/alice/blog". */
  path: string;
  /** Deployment currently being served; null before the first deploy. */
  activeDeploymentId: string | null;
  /** User-defined environment variables (container apps). */
  env: Record<string, string>;
  /** Per-app container memory cap in MB; null means use the server default. */
  memoryLimitMb: number | null;
  createdAt: string;
  lastDeployedAt: string | null;
  /** Effective role of the requesting user for this app. */
  viewerRole: 'owner' | 'admin' | 'manage' | 'view';
}

export interface UpdateAppRequest {
  routeMode?: RouteMode;
  /** Full replacement of the app's env vars; container is recreated to apply. */
  env?: Record<string, string>;
  description?: string;
  /** Container memory cap in MB; the running container is recreated to apply. */
  memoryLimitMb?: number;
}

export interface RollbackRequest {
  deploymentId: string;
}

export interface AppShareEntry {
  userId: string;
  username: string;
  role: ShareRole;
}

export interface AppSharing {
  sharedAll: ShareRole | null;
  shares: AppShareEntry[];
}

export interface UpdateAppSharingRequest {
  sharedAll: ShareRole | null;
  shares: { userId: string; role: ShareRole }[];
}

export interface ShareableUser {
  id: string;
  username: string;
}
