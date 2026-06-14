import { styled } from '@linaria/react';
import { colors, font, motion, typography } from '../styles/tokens';

/** Rectangular dark field, 8px radius — designmd's input grammar. */
export const Input = styled.input`
  ${font(typography.body)}
  width: 100%;
  height: 40px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid ${colors.hairline};
  background: rgba(237, 233, 224, 0.04);
  color: ${colors.text};
  transition: border-color ${motion.color}, background ${motion.color};

  &::placeholder {
    color: ${colors.textFaint};
  }
  &:hover {
    border-color: ${colors.hairlineStrong};
  }
  &:focus-visible {
    outline: none;
    border-color: ${colors.accent};
    background: rgba(237, 233, 224, 0.06);
  }
  /* Validation failure — set aria-invalid on the element. */
  &[aria-invalid='true'] {
    border-color: ${colors.statusFailed};
  }
`;

/** Tiny uppercase field label, above the input. */
export const Label = styled.label`
  ${font(typography.eyebrow)}
  display: block;
  color: ${colors.textMuted};
  margin-bottom: 7px;
`;
