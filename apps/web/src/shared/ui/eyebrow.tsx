import { styled } from '@linaria/react';
import { colors, font, typography } from '../styles/tokens';

/** Tiny uppercase orange label above a section — the system's editorial voice. */
export const Eyebrow = styled.p`
  ${font(typography.eyebrow)}
  color: ${colors.accent};
  margin-bottom: 10px;
`;
