/** How the gateway exposes a container app under /:userId/:appName. */
export const RouteMode = {
  /** Reverse-proxy with the path prefix stripped (default). */
  Proxy: 'proxy',
  /** 302 redirect to the app's dedicated port — escape hatch for apps that break under a path prefix. */
  Redirect: 'redirect',
} as const;

export type RouteMode = (typeof RouteMode)[keyof typeof RouteMode];
