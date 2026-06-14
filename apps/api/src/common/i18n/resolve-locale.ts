import type { ApiLocale } from './messages';

/**
 * Picks a supported locale from an Accept-Language header value.
 * Rule: if the highest-preference tag starts with "ko", return 'ko'.
 * Everything else (en, fr, zh, missing header, …) falls back to 'en'.
 * This mirrors the web dashboard's detectInitialLocale() heuristic.
 */
export function resolveLocale(acceptLanguage: string | undefined): ApiLocale {
  if (!acceptLanguage) return 'en';
  // Accept-Language is a comma-separated list of language tags with optional
  // quality factors, e.g. "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7".
  // We pick the tag with the highest q-value (first entry after parsing).
  const best = acceptLanguage
    .split(',')
    .map((entry) => {
      const [tag = '', qPart = ''] = entry.trim().split(';');
      const q = qPart.startsWith('q=') ? parseFloat(qPart.slice(2)) : 1;
      return { tag: tag.trim(), q: isNaN(q) ? 1 : q };
    })
    .sort((a, b) => b.q - a.q)[0];

  if (best?.tag.toLowerCase().startsWith('ko')) return 'ko';
  return 'en';
}
