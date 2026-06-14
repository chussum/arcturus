/** Progress of a single deployment through the pipeline. */
export const DeploymentStatus = {
  Queued: 'queued',
  Building: 'building',
  Running: 'running',
  Failed: 'failed',
} as const;

export type DeploymentStatus = (typeof DeploymentStatus)[keyof typeof DeploymentStatus];
