import path from 'node:path';

/**
 * All runtime configuration in one place, resolved from environment
 * variables with local-server-friendly defaults.
 */
export class AppConfig {
  /** Production tightens fail-closed checks (secrets must be explicit, no plaintext fallbacks). */
  readonly isProduction = process.env.NODE_ENV === 'production';

  /** Control-plane port: REST API + dashboard proxy. */
  readonly gatewayPort = readInt('ARCTURUS_PORT', 7777);

  /**
   * Separate origin for deployed user apps, so their JS runs cross-origin to
   * the control plane and cannot ride a logged-in visitor's session cookie.
   * The /api Origin guard depends on this split to tell app traffic apart from
   * dashboard traffic. Give each instance on a shared host its own value.
   */
  readonly appsPort = readInt('ARCTURUS_APPS_PORT', 7778);

  /**
   * Internal port the API control-plane server actually binds. Defaults to
   * gatewayPort so the API works standalone without an ingress.
   *
   * When running behind the ingress proxy (scripts/api-swap.sh), this is set
   * to a dynamically allocated loopback port so the public :7777 stays with the
   * ingress layer and API instances can swap without any gap on the public port.
   * URL-building code (redirects, logs, Origin checks) always uses gatewayPort
   * — the public address clients actually connect to.
   */
  readonly listenGatewayPort = readInt('ARCTURUS_LISTEN_PORT', this.gatewayPort);

  /**
   * Internal port the apps-origin server actually binds. Mirrors listenGatewayPort
   * for the second listener. The public appsPort is used for URL building and the
   * localPort branch in the gateway middleware.
   */
  readonly listenAppsPort = readInt('ARCTURUS_LISTEN_APPS_PORT', this.appsPort);

  /** Where the SQLite db, deployed static sites and build workspaces live. */
  readonly dataDir = path.resolve(process.env.ARCTURUS_DATA_DIR ?? './data');

  /** Secret for signing session JWTs. Auto-generated file fallback keeps restarts stable. */
  readonly jwtSecret = process.env.ARCTURUS_JWT_SECRET ?? '';

  /** Password for the seeded admin account; printed once when generated. */
  readonly adminPassword = process.env.ARCTURUS_ADMIN_PASSWORD ?? '';

  /** Key for at-rest encryption of app env vars. Auto-generated file fallback (data/env-key). */
  readonly envKey = process.env.ARCTURUS_ENV_KEY ?? '';

  /** Dedicated host-port pool for container apps. */
  readonly portPoolStart = readInt('ARCTURUS_PORT_POOL_START', 30000);
  readonly portPoolEnd = readInt('ARCTURUS_PORT_POOL_END', 30999);

  /** Upload limit for deployment archives, in megabytes. */
  readonly maxUploadMb = readInt('ARCTURUS_MAX_UPLOAD_MB', 256);

  /** How many past releases (static dirs / images) to keep per app for rollback. */
  readonly keepReleases = readInt('ARCTURUS_KEEP_RELEASES', 5);

  /** Default container memory cap (MB) when an app has no explicit limit. */
  readonly defaultMemoryMb = readInt('ARCTURUS_DEFAULT_MEMORY_MB', 1024);

  /** Hard ceiling (MB) a per-app memory limit may not exceed — protects the shared host. */
  readonly maxMemoryMb = readInt('ARCTURUS_MAX_MEMORY_MB', 4096);

  /**
   * When set (e.g. "1000:1000"), deployed containers are forced to run as this
   * user instead of the image default — a hardening opt-in. Empty = honor the
   * image's own USER (often root). Applies to both runtime and build.
   */
  readonly containerUser = process.env.ARCTURUS_CONTAINER_USER ?? '';

  /**
   * SSH/OS login surfaced in the dashboard's terminal-access hint, so the
   * docker commands read `ssh://<this>@host` instead of a placeholder. Empty =
   * the UI shows `<ssh-user>`. Not a secret — a convenience the operator opts
   * into; it's the host login, not the Arcturus username.
   */
  readonly sshUser = process.env.ARCTURUS_SSH_USER ?? '';

  /**
   * Express `trust proxy` setting for deployments behind a TLS-terminating
   * reverse proxy. Without it req.secure / req.ip / req.protocol see the proxy,
   * so Secure cookies are never set and rate limits key on the proxy's IP.
   * Accepts the values Express does: a hop count ("1") or names ("loopback").
   * Empty (default) = no proxy in front, headers are not trusted.
   */
  readonly trustProxy: string | number = readTrustProxy();

  /**
   * Explicit override for the Next.js dashboard upstream (dev, verify stacks, manual ops).
   * In production the active upstream is tracked by DashboardUpstreamService via the
   * data/dashboard-upstream state file written by scripts/web-swap.sh on each blue-green flip.
   * Leave unset for normal production use.
   */
  readonly dashboardOrigin = process.env.ARCTURUS_DASHBOARD_ORIGIN ?? 'http://127.0.0.1:3000';

  /** Directory holding cross-compiled CLI binaries (apps/cli `bun run build:all`). */
  readonly cliDistDir = path.resolve(process.env.ARCTURUS_CLI_DIST ?? '../cli/dist/cli');

  get databaseFile(): string {
    return path.join(this.dataDir, 'arcturus.db');
  }

  get sitesDir(): string {
    return path.join(this.dataDir, 'sites');
  }

  get buildsDir(): string {
    return path.join(this.dataDir, 'builds');
  }
}

function readTrustProxy(): string | number {
  const raw = process.env.ARCTURUS_TRUST_PROXY ?? '';
  if (!raw) return '';
  const numeric = Number.parseInt(raw, 10);
  return Number.isNaN(numeric) ? raw : numeric;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  }
  return value;
}
