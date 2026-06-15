'use client';

import type { AppSummary, PortUnavailableReason } from '@arcturus/shared';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { checkAppPort, setAppPort } from '../../entities/app/api';
import { useI18n } from '../../shared/i18n/locale-context';
import { useAsyncAction } from '../../shared/lib/use-async-action';
import { colors, font, fontStack, typography } from '../../shared/styles/tokens';
import { Button, Input, TextButton } from '../../shared/ui';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(11, 10, 6, 0.66);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: arcturus-fade-in 160ms ease-out;

  @keyframes arcturus-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const Panel = styled.div`
  width: min(420px, 100%);
  background: ${colors.surface2};
  border: 1px solid ${colors.hairlineStrong};
  border-radius: 14px;
  padding: 24px;
  animation: arcturus-panel-in 200ms cubic-bezier(0.21, 0.8, 0.32, 1);

  @keyframes arcturus-panel-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

const Title = styled.h3`
  ${font(typography.sectionTitle)}
  color: ${colors.text};
`;

const Hint = styled.p`
  ${font(typography.caption)}
  color: ${colors.textMuted};
  margin-top: 8px;
`;

const Field = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;

  input {
    flex: 1;
    min-width: 0;
    font-family: ${fontStack.mono};
  }
`;

/** Status line under the field — reserves its own row so the panel doesn't jump. */
const Status = styled.p<{ $ok: boolean }>`
  ${font(typography.caption)}
  min-height: 18px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${({ $ok }) => ($ok ? colors.statusRunning : colors.statusFailed)};
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  margin-top: 20px;
  gap: 8px;

  & > :first-child {
    margin-right: auto;
  }
`;

type CheckState =
  | { kind: 'idle' }
  | { kind: 'ok'; port: number }
  | { kind: 'fail'; port: number; reason: PortUnavailableReason };

export function PortSettingsModal({
  app,
  open,
  onClose,
  onSaved,
}: {
  app: AppSummary;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(app.assignedPort?.toString() ?? '');
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' });

  // Reset to the app's current port each time the modal opens.
  useEffect(() => {
    if (open) {
      setValue(app.assignedPort?.toString() ?? '');
      setCheck({ kind: 'idle' });
    }
  }, [open, app.assignedPort]);

  const parsed = Number.parseInt(value, 10);
  const validNumber = Number.isInteger(parsed) && value.trim() !== '';

  const runCheck = useAsyncAction(async () => {
    if (!validNumber) return;
    const result = await checkAppPort(app.id, parsed);
    setCheck(
      result.available
        ? { kind: 'ok', port: parsed }
        : { kind: 'fail', port: parsed, reason: result.reason ?? 'taken' },
    );
  });

  const save = useAsyncAction(
    async () => {
      await setAppPort(app.id, parsed);
      onSaved();
      onClose();
    },
    { successMessage: t.appDetail.portSaved },
  );

  const reset = useAsyncAction(
    async () => {
      await setAppPort(app.id, null);
      onSaved();
      onClose();
    },
    { successMessage: t.appDetail.portResetDone },
  );

  const busy = runCheck.busy || save.busy || reset.busy;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  // Save is allowed only once the entered port has been confirmed available and
  // differs from the current one — re-typing clears the check, forcing a re-confirm.
  const checkedOk = check.kind === 'ok' && check.port === parsed;
  const canSave = checkedOk && parsed !== app.assignedPort;

  const reasonMessage: Record<PortUnavailableReason, string> = {
    outOfRange: t.appDetail.portUnavailableOutOfRange,
    reserved: t.appDetail.portUnavailableReserved,
    taken: t.appDetail.portUnavailableTaken,
  };

  return (
    <Backdrop
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <Panel role="dialog" aria-modal="true" aria-label={t.appDetail.portModalTitle}>
        <Title>{t.appDetail.portModalTitle}</Title>
        <Hint>{t.appDetail.portModalHint}</Hint>

        <Field>
          <Input
            type="number"
            inputMode="numeric"
            min={1024}
            max={65535}
            value={value}
            placeholder={t.appDetail.portInputPlaceholder}
            aria-invalid={check.kind === 'fail' && check.port === parsed}
            onChange={(event) => {
              setValue(event.target.value);
              setCheck({ kind: 'idle' });
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && validNumber && !checkedOk) void runCheck.run();
            }}
          />
          <Button
            type="button"
            variant="ghost"
            busy={runCheck.busy}
            disabled={!validNumber || checkedOk}
            onClick={() => void runCheck.run()}
          >
            {t.appDetail.portCheck}
          </Button>
        </Field>

        <Status $ok={checkedOk} aria-live="polite">
          {checkedOk
            ? t.appDetail.portAvailable
            : check.kind === 'fail' && check.port === parsed
              ? reasonMessage[check.reason]
              : ''}
        </Status>

        <Footer>
          <TextButton
            type="button"
            busy={reset.busy}
            disabled={busy}
            onClick={() => void reset.run()}
          >
            {t.appDetail.portReset}
          </TextButton>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            busy={save.busy}
            disabled={!canSave || busy}
            onClick={() => void save.run()}
          >
            {t.appDetail.save}
          </Button>
        </Footer>
      </Panel>
    </Backdrop>
  );
}
