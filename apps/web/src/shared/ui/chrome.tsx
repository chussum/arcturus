import { styled } from '@linaria/react';
import { colors, font, typography } from '../styles/tokens';

/** Slim frosted global nav over the warm void. */
export const GlobalNavBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
  background: rgba(17, 16, 8, 0.78);
  backdrop-filter: saturate(160%) blur(18px);
  -webkit-backdrop-filter: saturate(160%) blur(18px);
  border-bottom: 1px solid ${colors.hairline};
  color: ${colors.text};
`;

/** Page header strip below the nav — compact title row, not a second chrome bar. */
export const SubNavBar = styled.nav`
  position: sticky;
  top: 56px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  padding: 10px 24px;
  background: rgba(17, 16, 8, 0.72);
  backdrop-filter: saturate(160%) blur(18px);
  -webkit-backdrop-filter: saturate(160%) blur(18px);
  border-bottom: 1px solid ${colors.hairline};
`;

export const SubNavTitle = styled.span`
  ${font(typography.pageTitle)}
  color: ${colors.text};
`;

/** Upload progress track — sits inside FloatingStickyBar. */
export const UploadProgressTrack = styled.div`
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: ${colors.hairlineStrong};
  overflow: hidden;
`;

/**
 * Animated fill for the upload progress track.
 * Set the CSS custom property --pct (e.g. style={{ '--pct': '42%' }}) to control width.
 */
export const UploadProgressFill = styled.div`
  height: 100%;
  border-radius: 2px;
  background: ${colors.accent};
  width: var(--pct, 0%);
  transition: width 150ms cubic-bezier(0.4, 0, 0.2, 1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/** Floating dark-glass status bar (live deploy progress). */
export const FloatingStickyBar = styled.div`
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 18px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(640px, calc(100vw - 36px));
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(29, 26, 18, 0.92);
  backdrop-filter: saturate(160%) blur(16px);
  -webkit-backdrop-filter: saturate(160%) blur(16px);
  border: 1px solid ${colors.hairlineStrong};
  animation: arcturus-bar-rise 280ms cubic-bezier(0.21, 0.8, 0.32, 1);

  @keyframes arcturus-bar-rise {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
`;
