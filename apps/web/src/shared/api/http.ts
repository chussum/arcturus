/** Error shape thrown for non-2xx API responses, carrying the server message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const LOCALE_STORAGE_KEY = 'arcturus-locale';

/**
 * Reads the active locale from localStorage (set by LocaleProvider) and
 * returns an Accept-Language header value so the API responds in the same
 * language. Falls back to navigator.language and then 'en'.
 */
function getAcceptLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved === 'ko' || saved === 'en') return saved;
  return window.navigator.language ?? 'en';
}

/**
 * Thin fetch wrapper for the platform API. Paths are root-relative (/api/...):
 * in dev Next rewrites them to the gateway, in production the gateway itself
 * serves both this dashboard and the API on one port.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Accept-Language': getAcceptLanguage(),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (body.message)
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      // non-JSON error body — keep the status text
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
