'use client';

import { styled } from '@linaria/react';
import { type FormEvent, useId, useState } from 'react';
import { changePassword } from '../../entities/user/api';
import { useI18n } from '../../shared/i18n/locale-context';
import { useAsyncAction } from '../../shared/lib/use-async-action';
import { colors, font, spacing, typography } from '../../shared/styles/tokens';
import { Button, Card, Input, Label, Reveal, SubNavBar, SubNavTitle } from '../../shared/ui';
import { useToast } from '../../shared/ui/toast';

const Page = styled.main`
  max-width: 660px;
  margin: 0 auto;
  padding: ${spacing.lg} ${spacing.lg} 120px;
`;

const FormCard = styled(Card)`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: ${spacing.md};
`;

const FieldWrap = styled.div`
  position: relative;
`;

const FieldError = styled.p`
  ${font(typography.caption)}
  color: ${colors.statusFailed};
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  margin: 0;
`;

export function AccountWidget() {
  const { t } = useI18n();
  const { notify } = useToast();
  const uid = useId();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<'mismatch' | 'tooShort' | null>(null);

  const save = useAsyncAction(async () => {
    if (next.length < 8) {
      setError('tooShort');
      return;
    }
    if (next !== confirm) {
      setError('mismatch');
      return;
    }
    setError(null);
    await changePassword(current, next);
    notify('success', t.account.saved);
    setCurrent('');
    setNext('');
    setConfirm('');
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save.run();
  }

  const newInvalid = error === 'tooShort' || error === 'mismatch';
  const confirmInvalid = error === 'mismatch';

  return (
    <>
      <SubNavBar>
        <SubNavTitle>{t.account.title}</SubNavTitle>
      </SubNavBar>
      <Page>
        <Reveal>
          <FormCard as="form" onSubmit={handleSubmit}>
            <FieldWrap>
              <Label htmlFor={`${uid}-current`}>{t.account.currentPassword}</Label>
              <Input
                id={`${uid}-current`}
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </FieldWrap>
            <FieldWrap style={{ marginBottom: error === 'tooShort' ? 20 : 0 }}>
              <Label htmlFor={`${uid}-new`}>{t.account.newPassword}</Label>
              <Input
                id={`${uid}-new`}
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => {
                  setNext(e.target.value);
                  setError(null);
                }}
                aria-invalid={newInvalid ? 'true' : undefined}
              />
              {error === 'tooShort' && <FieldError>{t.account.tooShort}</FieldError>}
            </FieldWrap>
            <FieldWrap style={{ marginBottom: error === 'mismatch' ? 20 : 0 }}>
              <Label htmlFor={`${uid}-confirm`}>{t.account.confirmPassword}</Label>
              <Input
                id={`${uid}-confirm`}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError(null);
                }}
                aria-invalid={confirmInvalid ? 'true' : undefined}
              />
              {error === 'mismatch' && <FieldError>{t.account.mismatch}</FieldError>}
            </FieldWrap>
            <Button type="submit" busy={save.busy}>
              {t.account.save}
            </Button>
          </FormCard>
        </Reveal>
      </Page>
    </>
  );
}
