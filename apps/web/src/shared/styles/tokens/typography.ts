/**
 * Type ramp v3 — compact editorial scale benchmarked against designmd.co.
 * Geist carries the whole UI; Geist Mono is the instrument voice for ids,
 * ports, paths and logs; Instrument Serif italic is reserved for the one
 * editorial display moment (login hero, big empty states).
 */
export const fontStack = {
  text: "'Geist Variable', system-ui, -apple-system, sans-serif",
  mono: "'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
  serif: "'Instrument Serif', Georgia, serif",
} as const;

interface TypeToken {
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: string;
  fontStyle?: string;
  textTransform?: string;
}

const text = (size: number, weight: number, line: number, tracking: number): TypeToken => ({
  fontFamily: fontStack.text,
  fontSize: `${size}px`,
  fontWeight: weight,
  lineHeight: line,
  letterSpacing: `${tracking}px`,
});

export const typography = {
  /** The editorial display — italic serif, login hero / grand empty states. */
  heroSerif: {
    fontFamily: fontStack.serif,
    fontSize: '52px',
    fontWeight: 400,
    lineHeight: 1.12,
    letterSpacing: '-0.5px',
    fontStyle: 'italic',
  } as TypeToken,
  /** Big page titles (blog-style). */
  displayTitle: text(40, 700, 1.15, -1.2),
  /** Utility page titles — designmd /compare scale. */
  pageTitle: text(24, 600, 1.3, -0.72),
  sectionTitle: text(17, 600, 1.35, -0.34),
  body: text(15, 400, 1.55, -0.15),
  bodyStrong: text(15, 600, 1.4, -0.15),
  caption: text(13, 400, 1.5, -0.08),
  captionStrong: text(13, 600, 1.4, -0.08),
  /** Tiny uppercase accent label above sections. */
  eyebrow: {
    fontFamily: fontStack.text,
    fontSize: '11px',
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
  } as TypeToken,
  nav: text(14, 400, 1.3, -0.14),
  navStrong: text(14, 600, 1.3, -0.28),
  button: text(14, 500, 1.2, -0.14),
  mono: {
    fontFamily: fontStack.mono,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: 1.6,
    letterSpacing: '0px',
  } as TypeToken,
} as const;

/** Serializes a token for interpolation inside a Linaria template literal. */
export function font(token: TypeToken): string {
  return `
    font-family: ${token.fontFamily};
    font-size: ${token.fontSize};
    font-weight: ${token.fontWeight};
    line-height: ${token.lineHeight};
    letter-spacing: ${token.letterSpacing};
    ${token.fontStyle ? `font-style: ${token.fontStyle};` : ''}
    ${token.textTransform ? `text-transform: ${token.textTransform};` : ''}
  `;
}
