import { styled } from '@linaria/react';
import { colors, motion } from '../styles/tokens';

/** Warm dark panel — hairline-drawn, no shadows, compact 14px radius. */
export const Card = styled.div`
  background: ${colors.surface1};
  border: 1px solid ${colors.hairline};
  border-radius: 14px;
  padding: 28px;
  transition: border-color ${motion.color};
`;

/** A card that responds: surface lifts one step, hairline brightens. */
export const InteractiveCard = styled(Card)`
  cursor: pointer;
  transition:
    border-color ${motion.color},
    background ${motion.color},
    transform ${motion.base};

  &:hover {
    border-color: ${colors.hairlineStrong};
    background: ${colors.surface2};
    transform: translateY(-2px);
  }
  &:active {
    transform: translateY(0) scale(0.995);
  }
`;

/** Empty states & drop zones — designmd's dashed panel. */
export const DashedPanel = styled.div`
  border: 1px dashed ${colors.hairlineStrong};
  border-radius: 14px;
  padding: 48px 28px;
  text-align: center;
  color: ${colors.textMuted};
`;
