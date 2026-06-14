'use client';

import type { AppSummary } from '@arcturus/shared';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../shared/i18n/locale-context';
import { useAsyncAction } from '../../shared/lib/use-async-action';
import { colors, fontStack, motion, spacing } from '../../shared/styles/tokens';
import { Button, Caption, Card, Eyebrow, TextButton } from '../../shared/ui';

/** Rows live in a capped, scrollable region so a long env list never stretches the card. */
const EnvRows = styled.div`
  max-height: 344px;
  overflow-y: auto;
  margin-top: 4px;
  padding-right: 2px;
`;

const EnvRow = styled.div`
  display: flex;
  gap: ${spacing.xs};
  align-items: center;
  margin-top: ${spacing.xs};
`;

const EnvInput = styled.input`
  font-family: ${fontStack.mono};
  font-size: 12px;
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid ${colors.hairline};
  background: rgba(237, 233, 224, 0.04);
  color: ${colors.text};
  transition: border-color ${motion.color};

  &::placeholder {
    color: ${colors.textFaint};
  }
  &:focus-visible {
    outline: none;
    border-color: ${colors.accent};
  }
`;

const Remove = styled.button`
  font-size: 12px;
  color: ${colors.textFaint};
  padding: 4px 6px;
  transition: color ${motion.color};

  &:hover {
    color: ${colors.statusFailed};
  }
`;

const Reveal = styled.button`
  font-family: ${fontStack.mono};
  font-size: 11px;
  color: ${colors.textFaint};
  padding: 4px 6px;
  transition: color ${motion.color};

  &:hover {
    color: ${colors.text};
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: ${spacing.md};
`;

interface EnvEntry {
  key: string;
  value: string;
}

/** Key/value editor for the app's container env. Saving recreates the container. */
export function EnvEditor({
  app,
  onSave,
}: {
  app: AppSummary;
  onSave: (env: Record<string, string>) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  // Values render masked by default; the user reveals individual rows on demand.
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  // While the user has unsaved edits, polling must never overwrite them.
  const [dirty, setDirty] = useState(false);

  const save = useAsyncAction(
    async () => {
      const env = Object.fromEntries(
        entries.filter((row) => row.key.trim() !== '').map((row) => [row.key.trim(), row.value]),
      );
      await onSave(env);
      setDirty(false);
    },
    { successMessage: t.appDetail.envSaved },
  );

  // Content-keyed server snapshot: the poll returns a fresh object every few
  // seconds, so comparing by value (not reference) is what prevents resets.
  const serverEnv = JSON.stringify(Object.entries(app.env).sort(([a], [b]) => a.localeCompare(b)));

  // biome-ignore lint/correctness/useExhaustiveDependencies: app.env is represented by serverEnv (by value)
  useEffect(() => {
    if (dirty) return;
    setEntries(Object.entries(app.env).map(([key, value]) => ({ key, value })));
  }, [serverEnv, dirty]);

  function setEntry(index: number, patch: Partial<EnvEntry>) {
    setDirty(true);
    setEntries((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const hasBlankRow = entries.some((row) => row.key.trim() === '' && row.value.trim() === '');

  return (
    <Card style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
      <Eyebrow>{t.appDetail.envTitle}</Eyebrow>
      <Caption>{t.appDetail.envHint}</Caption>

      {entries.length === 0 && <Caption style={{ marginTop: 12 }}>{t.appDetail.envEmpty}</Caption>}
      {entries.length > 0 && (
        <EnvRows>
          {entries.map((entry, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional while being edited
            <EnvRow key={index}>
              <EnvInput
                placeholder="KEY"
                value={entry.key}
                // A freshly added blank row mounts focused, ready to type.
                autoFocus={entry.key === '' && entry.value === '' && index === entries.length - 1}
                onChange={(event) => setEntry(index, { key: event.target.value })}
                spellCheck={false}
              />
              <EnvInput
                placeholder="value"
                type={revealed.has(index) ? 'text' : 'password'}
                value={entry.value}
                onChange={(event) => setEntry(index, { value: event.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
              <Reveal
                type="button"
                aria-label={
                  revealed.has(index) ? t.appDetail.envHideValue : t.appDetail.envShowValue
                }
                title={revealed.has(index) ? t.appDetail.envHideValue : t.appDetail.envShowValue}
                onClick={() =>
                  setRevealed((shown) => {
                    const next = new Set(shown);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })
                }
              >
                {revealed.has(index) ? 'hide' : 'show'}
              </Reveal>
              <Remove
                type="button"
                onClick={() => {
                  setDirty(true);
                  setEntries((rows) => rows.filter((_, i) => i !== index));
                }}
              >
                ✕
              </Remove>
            </EnvRow>
          ))}
        </EnvRows>
      )}

      <Footer>
        <TextButton
          type="button"
          // One blank row at a time — fill it (or remove it) before adding another.
          disabled={hasBlankRow}
          onClick={() => {
            setDirty(true);
            setEntries((rows) => [...rows, { key: '', value: '' }]);
          }}
        >
          + {t.appDetail.envAdd}
        </TextButton>
        <Button type="button" variant="ghost" busy={save.busy} onClick={() => void save.run()}>
          {t.appDetail.envSave}
        </Button>
      </Footer>
    </Card>
  );
}
