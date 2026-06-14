/**
 * pm2 process definitions for the whole platform.
 * Use the friendly wrappers instead of touching pm2 directly:
 *   bun run server:up / server:down / server:status / server:logs
 *
 * Only the ingress front-proxy is defined here. It is the sole process that
 * permanently holds the public ports (:7777 / :7778) and forwards each request
 * to the currently active API colour (read from data/api-upstream, written by
 * scripts/api-swap.sh). Restarting the ingress is the only remaining step that
 * causes a brief public-port gap; the ingress itself rarely needs restarting.
 *
 * API colours  (arcturus-api-a / -b)  — managed by scripts/api-swap.sh
 * Web colours  (arcturus-web-a / -b)  — managed by scripts/web-swap.sh
 * Neither is defined here; `pm2 start ecosystem.config.cjs` only affects the ingress.
 */
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'arcturus-ingress',
      cwd: path.join(__dirname, 'apps/api'),
      // Thin HTTP reverse proxy — reads data/api-upstream on every request
      // (mtime-cached: one statSync per request). No secrets needed.
      script: 'bun',
      args: 'src/ingress.ts',
      interpreter: 'none',
      autorestart: true,
      // Ingress holds no open SSE streams or DB connections; a short kill_timeout is fine.
      kill_timeout: 5000,
      // Bun's runtime baseline RSS is ~70MB, so a 64M cap caused a constant
      // memory-kill restart loop (pm2 restarting the public front door every ~30s →
      // :7777/:7778 blips). 300M leaves headroom while still catching a real leak.
      max_memory_restart: '300M',
      time: true,
      out_file: path.join(__dirname, 'logs/ingress.out.log'),
      error_file: path.join(__dirname, 'logs/ingress.err.log'),
      env: {
        // Bake in public ports at ecosystem-load time so pm2 autorestart uses
        // the same values even if the calling shell environment later changes.
        ARCTURUS_PORT: process.env.ARCTURUS_PORT || '7777',
        ARCTURUS_APPS_PORT: process.env.ARCTURUS_APPS_PORT || '7778',
        ARCTURUS_DATA_DIR: process.env.ARCTURUS_DATA_DIR || path.join(__dirname, 'apps/api/data'),
      },
    },
  ],
};
