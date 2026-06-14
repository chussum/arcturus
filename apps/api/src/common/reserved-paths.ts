/**
 * First URL segments the gateway must never treat as app traffic — they
 * belong to the platform's own API and dashboard. Kept minimal on purpose:
 * anything else (e.g. /static/app.css) may be an absolute-path asset request
 * from a deployed app that the Referer fallback can still rescue.
 */
export const GATEWAY_BYPASS_SEGMENTS = new Set([
  'api',
  'dashboard',
  '_next',
  // CLI distribution: curl install script + platform binaries.
  'install.sh',
  'cli',
]);

/**
 * Usernames that can never be registered. A superset of the gateway bypass
 * list: it also blocks names that would collide with common asset paths or
 * well-known files.
 */
export const RESERVED_USERNAMES = new Set([
  ...GATEWAY_BYPASS_SEGMENTS,
  'assets',
  'static',
  'public',
  'favicon.ico',
  'robots.txt',
  'arcturus',
]);
