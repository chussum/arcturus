'use client';

import { styled } from '@linaria/react';
import { useState } from 'react';
import { useI18n } from '../../shared/i18n/locale-context';
import { copyText } from '../../shared/lib/clipboard';
import { colors, font, spacing, typography } from '../../shared/styles/tokens';
import { Card, CodeBlock, Eyebrow, Tagline, TextButton } from '../../shared/ui';
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

/** A labelled command region — "On the host" vs "From your laptop". */
const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing.sm};
  padding: ${spacing.md} 0;

  & + & {
    border-top: 1px solid ${colors.hairline};
  }
`;

const GroupTitle = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  ${font(typography.captionStrong)}
  color: ${colors.text};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 2px;
    background: ${colors.accent};
  }
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

/** "Terminal access" — copy-ready docker commands for this container, on the host or remote. */
export function DockerAccessGuide({
  ownerUsername,
  appName,
  sshUser,
}: {
  ownerUsername: string;
  appName: string;
  sshUser: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const container = `arcturus--${ownerUsername}--${appName}`;
  const host = typeof window === 'undefined' ? 'server' : window.location.hostname;
  // Server-configured SSH login (ARCTURUS_SSH_USER), else a fill-in-yourself placeholder.
  const user = sshUser || '<ssh-user>';

  return (
    <GuideCard>
      <HeadRow>
        <div>
          <Eyebrow>{t.dockerGuide.eyebrow}</Eyebrow>
          <Tagline>{t.dockerGuide.title}</Tagline>
          <p style={{ marginTop: 6 }}>
            <span style={{ color: colors.textMuted, fontSize: 13 }}>{t.dockerGuide.intro}</span>
          </p>
        </div>
        <TextButton
          type="button"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t.dockerGuide.hide : t.dockerGuide.show}
        </TextButton>
      </HeadRow>

      {open && (
        <>
          <Group>
            <GroupTitle>{t.dockerGuide.onHostTitle}</GroupTitle>
            <StepNote>{t.dockerGuide.onHostNote}</StepNote>
            <Step>
              <StepLabel>{t.dockerGuide.logsStep}</StepLabel>
              <CopyableCode command={`docker logs -f ${container}`} />
            </Step>
            <Step>
              <StepLabel>{t.dockerGuide.execStep}</StepLabel>
              <CopyableCode command={`docker exec ${container} ls -al`} />
            </Step>
            <Step>
              <StepLabel>{t.dockerGuide.shellStep}</StepLabel>
              <CopyableCode command={`docker exec -it ${container} sh`} />
              <StepNote>{t.dockerGuide.shellNote}</StepNote>
            </Step>
          </Group>

          <Group>
            <GroupTitle>{t.dockerGuide.remoteTitle}</GroupTitle>
            <StepNote>{t.dockerGuide.remoteNote}</StepNote>
            {!sshUser && <StepNote>{t.dockerGuide.remoteUserHint}</StepNote>}
            <Step>
              <CopyableCode command={`export DOCKER_HOST=ssh://${user}@${host}`} />
            </Step>
            <Step>
              <StepLabel>{t.dockerGuide.remoteOneLiner}</StepLabel>
              <CopyableCode command={`ssh ${user}@${host} docker logs -f ${container}`} />
            </Step>
          </Group>
        </>
      )}
    </GuideCard>
  );
}
