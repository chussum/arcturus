import type { NextConfig } from 'next';
import withRspack from 'next-rspack';
import withLinaria, { type LinariaConfig } from 'next-with-linaria';

// wyw-in-js merges user features over its defaults per key (loadWywOptions),
// so a partial object is safe at runtime — only the type demands every flag.
type LinariaFeatures = NonNullable<NonNullable<LinariaConfig['linaria']>['features']>;

const config: NextConfig = {
  reactStrictMode: true,
  // Opt-in build-output isolation: lets a second dev/build instance run next
  // to a live `next start` without the two fighting over the same .next dir.
  ...(process.env.ARCTURUS_DIST_DIR ? { distDir: process.env.ARCTURUS_DIST_DIR } : {}),
  // Next 16 silently refuses dev-internal requests (HMR socket, chunks) from
  // origins other than localhost — which breaks hydration entirely when the
  // dashboard is opened via 127.0.0.1 or a LAN IP. Allow those explicitly;
  // extend with ARCTURUS_DEV_ORIGINS="192.168.0.10,..." for team-LAN dev.
  allowedDevOrigins: [
    '127.0.0.1',
    ...(process.env.ARCTURUS_DEV_ORIGINS?.split(',').filter(Boolean) ?? []),
  ],
  // The gateway serves the dashboard under /dashboard on the public port.
  basePath: '/dashboard',
  // In dev the browser talks to Next directly (:3000); forward API calls to
  // the gateway server-side so the session cookie stays first-party.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.ARCTURUS_API_ORIGIN ?? 'http://127.0.0.1:7777'}/api/:path*`,
        basePath: false,
      },
    ];
  },
};

/**
 * dev/build run on Rspack (next-rspack) with Linaria through its
 * webpack-compatible loader. `next start` only serves the prebuilt output —
 * wrapping it trips Next's "configure only one bundler" guard, so the start
 * script sets ARCTURUS_BUNDLER=none. (Env var, not argv sniffing: Next loads
 * this config in worker processes whose argv differs.)
 */
// withRspack must wrap the INNER config (i.e. run before withLinaria): in dev,
// the Next 16 CLI sets TURBOPACK=auto before loading this file, and withLinaria
// branches on that env — seeing it truthy sends Linaria down its Turbopack path,
// so the rspack/webpack transform loader is never installed and every styled``
// component 500s at runtime ("Using the styled tag in runtime is not supported").
// withRspack is just an env toggle (deletes TURBOPACK, sets NEXT_RSPACK), so
// calling it first lets withLinaria pick its webpack branch in dev and build alike.
const linariaConfig: LinariaConfig = {
  ...config,
  // happy-dom is ESM-only and can't load in this CJS build runtime, so
  // wyw-in-js already runs without DOM emulation — opting out explicitly
  // just silences its per-build warning.
  linaria: { features: { happyDOM: false } as LinariaFeatures },
};

export default process.env.ARCTURUS_BUNDLER === 'none'
  ? config
  : withLinaria(withRspack(linariaConfig));
