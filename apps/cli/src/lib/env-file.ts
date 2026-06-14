import fs from 'node:fs';

/** Mirrors the server's env key charset (apps/api container-env.ts). */
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Minimal dotenv parser for `arcturus deploy`. Handles `KEY=value`, `export KEY=value`,
 * `#` comment and blank lines, and surrounding single/double quotes. Lines without
 * an `=` are ignored. Throws on an invalid key so the deploy fails clearly client-side
 * rather than as an opaque 400 from the server.
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf8');
  const env: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(
        `${filePath}: invalid env key "${key}" (letters, digits, _; not starting with a digit)`,
      );
    }
    env[key] = unquote(withoutExport.slice(eq + 1).trim());
  }

  return env;
}

/** Strips a single matching pair of surrounding quotes; leaves bare values untouched. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value[value.length - 1] === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}
