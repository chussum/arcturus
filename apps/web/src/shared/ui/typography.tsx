import { styled } from '@linaria/react';
import { colors, font, fontStack, motion, typography } from '../styles/tokens';

/** The one editorial moment — italic serif display (login hero, grand empty states). */
export const SerifTitle = styled.h1`
  ${font(typography.heroSerif)}
  color: ${colors.text};
`;

export const DisplayTitle = styled.h2`
  ${font(typography.displayTitle)}
  color: ${colors.text};
`;

export const PageTitle = styled.h2`
  ${font(typography.pageTitle)}
  color: ${colors.text};
`;

export const Tagline = styled.h3`
  ${font(typography.sectionTitle)}
  color: ${colors.text};
`;

export const Lead = styled.p`
  ${font(typography.body)}
  color: ${colors.textMuted};
`;

export const BodyText = styled.p`
  ${font(typography.body)}
  color: ${colors.text};
`;

export const Caption = styled.p`
  ${font(typography.caption)}
  color: ${colors.textMuted};
`;

/** Instrument voice — ids, ports, paths. */
export const Mono = styled.span`
  ${font(typography.mono)}
  color: ${colors.textMuted};
`;

/** "Read →" style link; the arrow eases forward on hover. */
export const ArrowLink = styled.a`
  ${font(typography.caption)}
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${colors.accent};

  &::after {
    content: '→';
    transition: transform ${motion.color};
  }
  &:hover::after {
    transform: translateX(4px);
  }
`;

/** Dark code block with mono text and a quiet hairline. */
export const CodeBlock = styled.pre`
  font-family: ${fontStack.mono};
  font-size: 12px;
  line-height: 1.7;
  background: ${colors.black};
  color: ${colors.cream};
  border: 1px solid ${colors.hairline};
  border-radius: 10px;
  padding: 12px 14px;
  overflow-x: auto;
  white-space: pre;
`;
