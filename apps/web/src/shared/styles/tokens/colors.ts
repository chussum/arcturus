/**
 * Arcturus design language v3 — warm editorial dark, benchmarked against
 * designmd.co: olive-black canvas, cream ink, a single warm-orange accent
 * for eyebrows/links/markers, and primary actions.
 * Light is drawn with hairlines and surface steps — never drop shadows.
 */
export const colors = {
  /** Warm orange — eyebrow labels, links, live markers, focus. */
  accent: '#d9823b',
  accentBright: '#eb9a55',
  accentWash: 'rgba(217, 130, 59, 0.12)',

  /** Cream — body ink and focus-ring on primary buttons (dark text on accent). */
  cream: '#ede9e0',

  /** Warm olive-black canvas. */
  void: '#111008',
  surface1: '#17150e',
  surface2: '#1d1a12',
  surface3: '#242017',
  black: '#0b0a06',

  hairline: 'rgba(237, 233, 224, 0.09)',
  hairlineStrong: 'rgba(237, 233, 224, 0.2)',

  text: '#ede9e0',
  textMuted: '#857f74',
  textFaint: '#5a564c',
  /** Ink on cream-filled primary buttons. */
  onCream: '#16140d',

  /** Status hues tuned for the warm dark surfaces. */
  statusRunning: '#4fbf67',
  statusFailed: '#e5564a',
  statusBusy: '#d9823b',
} as const;
