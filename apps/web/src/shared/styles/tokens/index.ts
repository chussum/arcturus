export * from './colors';
export * from './rounded';
export * from './spacing';
export * from './typography';

/** Motion grammar v3 — quiet 150ms color shifts, 300ms entrances. */
export const motion = {
  /** Color/border/background shifts — designmd's standard. */
  color: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '300ms cubic-bezier(0.21, 0.8, 0.32, 1)',
  slow: '500ms cubic-bezier(0.21, 0.8, 0.32, 1)',
  pressScale: 'scale(0.98)',
} as const;
