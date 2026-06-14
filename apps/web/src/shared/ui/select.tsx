import { styled } from '@linaria/react';
import { colors, font, motion, typography } from '../styles/tokens';

/**
 * Dark dropdown sharing the Input grammar (40px, 8px radius, hairline).
 * The native arrow is replaced with a two-gradient caret so it renders
 * identically across platforms instead of the OS default widget.
 */
export const Select = styled.select`
  ${font(typography.body)}
  appearance: none;
  height: 40px;
  padding: 0 34px 0 14px;
  border-radius: 8px;
  border: 1px solid ${colors.hairline};
  background-color: rgba(237, 233, 224, 0.04);
  background-image:
    linear-gradient(45deg, transparent 50%, ${colors.textMuted} 50%),
    linear-gradient(135deg, ${colors.textMuted} 50%, transparent 50%);
  background-position:
    calc(100% - 19px) calc(50% - 1px),
    calc(100% - 14px) calc(50% - 1px);
  background-size: 5px 5px;
  background-repeat: no-repeat;
  color: ${colors.text};
  cursor: pointer;
  transition: border-color ${motion.color}, background-color ${motion.color};

  &:hover {
    border-color: ${colors.hairlineStrong};
  }
  &:focus-visible {
    outline: none;
    border-color: ${colors.accent};
    background-color: rgba(237, 233, 224, 0.06);
  }

  /* The popup list is native; keep its rows on our dark surface where supported. */
  option {
    background: ${colors.surface2};
    color: ${colors.text};
  }
`;
