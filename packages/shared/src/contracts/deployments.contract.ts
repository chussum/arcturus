import type { AppType } from '../enums/app-type';
import type { DeploymentStatus } from '../enums/deployment-status';

/**
 * Multipart form fields accompanying the zip archive on POST /api/deployments.
 * The archive itself travels in the "archive" file field.
 */
export interface CreateDeploymentFields {
  appName: string;
  /**
   * Owner username for deploying to a shared app you have `manage` on. Omit (or pass your
   * own username) to target your own account. A cross-account target app must already exist.
   */
  owner?: string;
  /** Omit to let the server detect the type (Dockerfile present → container). */
  type?: AppType;
  /** Optional description, stored on the app when it is first created. */
  description?: string;
  /**
   * JSON-encoded Record<string,string>. Applied as the app's env only when the
   * app is first created (container apps); ignored on redeploys of an existing app.
   */
  env?: string;
}

export interface DeploymentSummary {
  id: string;
  appId: string;
  appName: string;
  status: DeploymentStatus;
  /** Set when the deployment finished, succeeded or failed. */
  finishedAt: string | null;
  createdAt: string;
  /** Whether this deployment's artifact is still on disk and can be rolled back to. */
  rollbackable: boolean;
  /** Whether this is the deployment currently being served. */
  active: boolean;
}

export interface DeploymentDetail extends DeploymentSummary {
  buildLog: string;
}
