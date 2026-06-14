import type { AppStatus, DeploymentStatus } from '@arcturus/shared';
import { styled } from '@linaria/react';
import { colors, font, motion, typography } from '../styles/tokens';

type Tone = 'running' | 'failed' | 'busy' | 'muted';

const Badge = styled.span<{ $tone: Tone }>`
  ${font(typography.mono)}
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
  border-radius: 9999px;
  background: rgba(237, 233, 224, 0.05);
  border: 1px solid ${colors.hairline};
  color: ${({ $tone }) =>
    $tone === 'running'
      ? colors.statusRunning
      : $tone === 'failed'
        ? colors.statusFailed
        : $tone === 'busy'
          ? colors.statusBusy
          : colors.textMuted};
  transition: color ${motion.color};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: currentColor;
    animation: ${({ $tone }) =>
      $tone === 'busy' ? 'arcturus-pulse 1.4s ease-in-out infinite' : 'none'};
  }

  @keyframes arcturus-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.35;
      transform: scale(0.8);
    }
  }
`;

const TONE_BY_STATUS: Record<string, Tone> = {
  running: 'running',
  failed: 'failed',
  building: 'busy',
  queued: 'busy',
  stopped: 'muted',
  idle: 'muted',
};

export function StatusBadge({ status }: { status: AppStatus | DeploymentStatus }) {
  return <Badge $tone={TONE_BY_STATUS[status] ?? 'muted'}>{status}</Badge>;
}

/**
 * Deployment lifecycle badge. A deployment's terminal 'running' state means
 * "built and serving" — reading it as a live container state is misleading
 * (the app may be stopped), so it displays as "success".
 */
export function DeploymentStatusBadge({ status }: { status: DeploymentStatus }) {
  return (
    <Badge $tone={TONE_BY_STATUS[status] ?? 'muted'}>
      {status === 'running' ? 'success' : status}
    </Badge>
  );
}
