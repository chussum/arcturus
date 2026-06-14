import type { AppType } from '@arcturus/shared';
import type { AppRow, UserRow } from '../../../infrastructure/persistence/drizzle/schema';

export interface DeployContext {
  app: AppRow;
  owner: UserRow;
  deploymentId: string;
  /** Extracted project root on disk; deleted after the pipeline finishes. */
  projectDir: string;
  /** Appends a line to the deployment's build log. */
  log: (line: string) => Promise<void>;
}

/**
 * One strategy per app type (OCP): the pipeline picks a strategy by type,
 * so adding a new runtime never modifies existing deploy code.
 */
export abstract class DeployStrategy {
  abstract readonly type: AppType;
  abstract deploy(context: DeployContext): Promise<void>;
}

/** Injection token for the registered strategy list. */
export const DEPLOY_STRATEGIES = Symbol('DEPLOY_STRATEGIES');
