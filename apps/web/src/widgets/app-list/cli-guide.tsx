'use client';

import { styled } from '@linaria/react';
import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '../../shared/i18n/locale-context';
import { copyText } from '../../shared/lib/clipboard';
import { colors, font, spacing, typography } from '../../shared/styles/tokens';
import { ArrowLink, Card, CodeBlock, Eyebrow, Tagline, TextButton } from '../../shared/ui';
import { useToast } from '../../shared/ui/toast';

const GuideCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${spacing.sm};
`;

const HeadRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${spacing.sm};
`;

const Step = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const StepLabel = styled.span`
  ${font(typography.captionStrong)}
  color: ${colors.textMuted};
`;

const StepNote = styled.span`
  color: ${colors.textMuted};
  font-size: 13px;
  line-height: 1.5;
`;

const CodeRow = styled.div`
  position: relative;

  pre {
    padding-right: 64px;
  }
  button {
    position: absolute;
    top: 10px;
    right: 12px;
  }
`;

function CopyableCode({ command }: { command: string }) {
  const { t } = useI18n();
  const { notify } = useToast();
  return (
    <CodeRow>
      <CodeBlock>{command}</CodeBlock>
      <TextButton
        type="button"
        onClick={async () => {
          const ok = await copyText(command);
          notify(ok ? 'success' : 'error', ok ? t.common.copied : t.common.copyFailed);
        }}
      >
        {t.common.copy}
      </TextButton>
    </CodeRow>
  );
}

/** "Deploy from the CLI" — install, login, deploy, with copy-ready commands. */
export function CliGuide() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const origin =
    typeof window === 'undefined'
      ? 'http://127.0.0.1:7777'
      : window.location.port === '3000'
        ? `http://${window.location.hostname}:7777`
        : window.location.origin;

  return (
    <GuideCard>
      <HeadRow>
        <div>
          <Eyebrow>{t.cliGuide.eyebrow}</Eyebrow>
          <Tagline>{t.cliGuide.title}</Tagline>
          <p style={{ marginTop: 6 }}>
            <span style={{ color: colors.textMuted, fontSize: 13 }}>{t.cliGuide.intro}</span>
          </p>
        </div>
        <TextButton
          type="button"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t.cliGuide.hide : t.cliGuide.show}
        </TextButton>
      </HeadRow>

      {open && (
        <>
          <Step>
            <StepLabel>{t.cliGuide.install}</StepLabel>
            <CopyableCode command={`curl -fsSL ${origin}/install.sh | sh`} />
          </Step>
          <Step>
            <StepLabel>{t.cliGuide.login}</StepLabel>
            <CopyableCode command={`arcturus login --server ${origin} --token <arc_...>`} />
            <ArrowLink as={Link} href="/settings/tokens">
              {t.cliGuide.tokenLink}
            </ArrowLink>
          </Step>
          <Step>
            <StepLabel>{t.cliGuide.deployStep}</StepLabel>
            <CopyableCode command={'arcturus deploy'} />
            <StepNote>{t.cliGuide.deployNote}</StepNote>
            <StepNote>{t.cliGuide.deployOptions}</StepNote>
          </Step>
        </>
      )}
    </GuideCard>
  );
}
