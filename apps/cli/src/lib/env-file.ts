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
    env[key] = normalizeEnvValue(withoutExport.slice(eq + 1));
  }

  return env;
}

/**
 * Normalizes a raw env value: trims surrounding whitespace and strips a
 * whitespace-preceded inline comment (`val # note` → `val`). A `#` without
 * preceding whitespace is part of the value (`#fff`, `ab#cd`, URL fragments
 * are preserved). A value wrapped in matching single/double quotes keeps its
 * inner content verbatim — a trailing comment after the closing quote is
 * dropped — so quoting is the escape hatch for literal ` #` or edge spaces.
 * Mirrors dotenv inline-comment semantics. Idempotent only for unquoted input,
 * so apply exactly once at each input boundary (never re-normalize server-side).
 */
export function normalizeEnvValue(raw: string): string {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const close = trimmed.indexOf(quote, 1);
    if (close !== -1) return trimmed.slice(1, close);
    // Unterminated quote: fall through to unquoted handling.
  }
  return trimmed.replace(/\s+#.*$/, '').trim();
}
