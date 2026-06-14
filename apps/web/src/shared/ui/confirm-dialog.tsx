'use client';

import { styled } from '@linaria/react';
import { useEffect } from 'react';
import { colors, font, typography } from '../styles/tokens';
import { Button } from './button';

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
  width: min(400px, 100%);
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

const Body = styled.p`
  ${font(typography.caption)}
  color: ${colors.textMuted};
  margin-top: 8px;
`;

const Row = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
`;

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Replaces window.confirm: a quiet dark panel with an explicit, busy-aware action. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <Backdrop
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <Panel role="alertdialog" aria-modal="true" aria-label={title}>
        <Title>{title}</Title>
        {body && <Body>{body}</Body>}
        <Row>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? 'danger' : 'primary'}
            busy={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Row>
      </Panel>
    </Backdrop>
  );
}
