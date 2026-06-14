/**
 * Radius grammar from DESIGN-apple.md: sm for compact utility, lg for cards,
 * pill for anything that reads as an action. Nothing in between.
 */
export const rounded = {
  none: '0px',
  xs: '5px',
  sm: '8px',
  md: '11px',
  lg: '18px',
  pill: '9999px',
  full: '9999px',
} as const;
