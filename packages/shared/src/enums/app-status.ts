/** Lifecycle state of a deployed app. */
export const AppStatus = {
  /** No successful deployment yet. */
  Idle: 'idle',
  /** Serving traffic (static sites are always running once deployed). */
  Running: 'running',
  /** Container exists but was stopped by the user. */
  Stopped: 'stopped',
  /** Last deployment or container start failed. */
  Failed: 'failed',
} as const;

export type AppStatus = (typeof AppStatus)[keyof typeof AppStatus];
