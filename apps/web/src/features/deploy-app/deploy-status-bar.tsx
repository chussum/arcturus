'use client';

import type { DeploymentStatus } from '@arcturus/shared';
import { styled } from '@linaria/react';
import type { CSSProperties } from 'react';
import { useI18n } from '../../shared/i18n/locale-context';
import { colors, fontStack } from '../../shared/styles/tokens';
import {
  DeploymentStatusBadge,
  FloatingStickyBar,
  UploadProgressFill,
  UploadProgressTrack,
} from '../../shared/ui';

/** Mono log line that scrolls in from below on each new entry. */
export const LogLine = styled.div`
  font-family: ${fontStack.mono};
  font-size: 12px;
  color: ${colors.textMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  animation: arcturus-line-in 200ms ease-out;

  @keyframes arcturus-line-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const UploadLabel = styled.span`
  font-family: ${fontStack.mono};
  font-size: 12px;
  color: ${colors.textMuted};
  white-space: nowrap;
`;

interface Props {
  uploadPct: number | null;
  logLines: string[];
  finalStatus: string | null;
}

/**
 * Floating status bar shared by DeployForm and RedeployButton.
 * While uploadPct is non-null, shows an upload progress bar.
 * Once the upload completes (uploadPct → null), shows live build log lines.
 */
export function DeployStatusBar({ uploadPct, logLines, finalStatus }: Props) {
  const { t } = useI18n();

  return (
    <FloatingStickyBar>
      {uploadPct !== null ? (
        <>
          <UploadLabel>
            {t.deploy.uploading} {uploadPct}%
          </UploadLabel>
          <UploadProgressTrack>
            <UploadProgressFill style={{ '--pct': `${uploadPct}%` } as CSSProperties} />
          </UploadProgressTrack>
        </>
      ) : (
        <LogLine key={logLines.length}>
          {logLines[logLines.length - 1] ?? t.deploy.starting}
        </LogLine>
      )}
      <DeploymentStatusBadge status={(finalStatus ?? 'building') as DeploymentStatus} />
    </FloatingStickyBar>
  );
}
