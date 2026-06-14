'use client';

import { styled } from '@linaria/react';
import { type FormEvent, useState } from 'react';
import { useI18n } from '../../shared/i18n/locale-context';
import { colors, font, motion, spacing, typography } from '../../shared/styles/tokens';
import { Button, Caption, Card, Input, Label } from '../../shared/ui';
import { useToast } from '../../shared/ui/toast';
import { DeployStatusBar } from './deploy-status-bar';
import { useUploadDeploy } from './use-upload-deploy';

// The app name becomes a URL path segment — same rule as the server.
const APP_NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

/** Live input shaping: lowercase, spaces→hyphens, anything else dropped. */
function sanitizeAppName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 31);
}

const Form = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${spacing.lg};
`;

/**
 * Top-aligned grid: every cell starts at the same label line, so a
 * validation message can never push its neighbours out of alignment.
 */
const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.4fr auto auto;
  gap: ${spacing.xs};
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

/** Label + input column; the error floats below without changing cell height. */
const Field = styled.div`
  position: relative;
`;

/** Spacer matching the label row, so buttons line up with the inputs. */
const ButtonCell = styled.div`
  padding-top: 21px;

  @media (max-width: 760px) {
    padding-top: 0;
  }
`;

const FileLabel = styled.label`
  ${font(typography.button)}
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid ${colors.hairlineStrong};
  color: ${colors.text};
  cursor: pointer;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: border-color ${motion.color}, background ${motion.color};

  &:hover {
    background: rgba(237, 233, 224, 0.07);
    border-color: rgba(237, 233, 224, 0.34);
  }

  input {
    display: none;
  }
`;

const DeployButton = styled(ButtonCell)`
  button {
    height: 40px;
  }
`;

const FieldError = styled.p`
  ${font(typography.caption)}
  position: absolute;
  top: 100%;
  left: 2px;
  margin-top: 4px;
  font-size: 12px;
  white-space: nowrap;
  color: ${colors.statusFailed};
  animation: arcturus-error-in 200ms ease-out;

  @keyframes arcturus-error-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

/** Zip-upload deploy; progress and build log stream into the floating bottom bar. */
export function DeployForm({ onDeployed }: { onDeployed: () => void }) {
  const { t } = useI18n();
  const { notify } = useToast();
  const [appName, setAppName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [nameError, setNameError] = useState('');
  const { busy, uploadPct, logLines, finalStatus, deploy } = useUploadDeploy();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!APP_NAME_PATTERN.test(appName)) {
      setNameError(t.deploy.appNameInvalid);
      return;
    }
    if (!file) {
      notify('error', t.deploy.chooseFirst);
      return;
    }
    setNameError('');
    deploy(appName, file, description, onDeployed, (msg) => notify('error', msg));
  }

  const showBar = busy || finalStatus !== null;

  return (
    <>
      <Form as="form" onSubmit={handleSubmit}>
        <Row>
          <Field>
            <Label htmlFor="appName">{t.deploy.appName}</Label>
            <Input
              id="appName"
              placeholder="my-app"
              value={appName}
              aria-invalid={nameError ? true : undefined}
              onChange={(event) => {
                setAppName(sanitizeAppName(event.target.value));
                if (nameError) setNameError('');
              }}
              spellCheck={false}
            />
            {nameError && <FieldError>{nameError}</FieldError>}
          </Field>
          <Field>
            <Label htmlFor="appDescription">{t.deploy.description}</Label>
            <Input
              id="appDescription"
              placeholder={t.deploy.descriptionPlaceholder}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
            />
          </Field>
          <ButtonCell>
            <FileLabel>
              {file ? file.name : t.deploy.chooseZip}
              <input
                type="file"
                accept=".zip,.html,.htm"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </FileLabel>
          </ButtonCell>
          <DeployButton>
            <Button type="submit" busy={busy}>
              {busy ? t.deploy.deploying : t.deploy.deploy}
            </Button>
          </DeployButton>
        </Row>
        <Caption>{t.deploy.hint}</Caption>
      </Form>

      {showBar && (
        <DeployStatusBar uploadPct={uploadPct} logLines={logLines} finalStatus={finalStatus} />
      )}
    </>
  );
}
