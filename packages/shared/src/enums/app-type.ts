/** How an app is executed on the platform. */
export const AppType = {
  /** Plain files served directly by the gateway from disk. */
  Static: 'static',
  /** Built from a Dockerfile and run as a container. */
  Container: 'container',
} as const;

export type AppType = (typeof AppType)[keyof typeof AppType];
