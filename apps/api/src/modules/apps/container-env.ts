import { LocalizedBadRequest } from '../../common/i18n/localized.exception';

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Keys the platform owns; user values can never shadow them. */
const SYSTEM_ENV_KEYS = new Set(['PORT', 'ARCTURUS_APP']);

/** Validates a user-supplied env map (key charset, string values). */
export function assertValidEnv(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new LocalizedBadRequest('env.invalidKey', { key });
    }
    if (typeof value !== 'string') {
      throw new LocalizedBadRequest('env.valueMustBeString', { key });
    }
  }
}

/** User env merged under the platform's own variables — system keys always win. */
export function buildContainerEnv(
  userEnv: Record<string, string>,
  system: { port: number; appRef: string },
): Record<string, string> {
  const safeUserEnv = Object.fromEntries(
    Object.entries(userEnv).filter(([key]) => !SYSTEM_ENV_KEYS.has(key)),
  );
  return {
    ...safeUserEnv,
    PORT: `${system.port}`,
    ARCTURUS_APP: system.appRef,
  };
}

/** Parses the JSON env column, tolerating legacy/corrupt values. */
export function parseEnvColumn(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
      ) as Record<string, string>;
    }
  } catch {
    // fall through
  }
  return {};
}
