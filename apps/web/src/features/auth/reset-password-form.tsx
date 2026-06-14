'use client';

import { styled } from '@linaria/react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { fetchResetInfo, resetPassword } from '../../entities/user/api';
import { useI18n } from '../../shared/i18n/locale-context';
import { useAsyncAction } from '../../shared/lib/use-async-action';
import { colors, font, spacing, typography } from '../../shared/styles/tokens';
import {
  Button,
  Caption,
  Card,
  Eyebrow,
  Input,
  Label,
  Reveal,
  SerifTitle,
  useToast,
} from '../../shared/ui';

const Hero = styled.main`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: ${spacing.xl};
  padding: ${spacing.xl};
  text-align: center;
`;

const BrandEyebrow = styled(Eyebrow)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;

  &::before {
    content: '✦';
    letter-spacing: 0;
  }
`;

const Tagline = styled.p`
  ${font(typography.body)}
  color: ${colors.textMuted};
  margin-top: 14px;
`;

const FormCard = styled(Card)`
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: ${spacing.md};
  text-align: left;
  background: rgba(23, 21, 14, 0.82);
  backdrop-filter: saturate(160%) blur(16px);
  -webkit-backdrop-filter: saturate(160%) blur(16px);
`;

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { notify } = useToast();
  const [username, setUsername] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [newError, setNewError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);

  useEffect(() => {
    fetchResetInfo(token)
      .then((info) => setUsername(info.username))
      .catch(() => setInvalid(true));
  }, [token]);

  const { run, busy } = useAsyncAction(async () => {
    setNewError(false);
    setConfirmError(false);
    if (newPassword.length < 8) {
      setNewError(true);
      return;
    }
    if (newPassword !== confirm) {
      setConfirmError(true);
      return;
    }
    await resetPassword(token, newPassword);
    notify('success', t.auth.resetDone);
    router.replace('/login');
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void run();
  }

  return (
    <Hero>
      <Reveal>
        <BrandEyebrow as="p">Arcturus</BrandEyebrow>
        <SerifTitle>{t.auth.resetTitle}</SerifTitle>
        {username && <Tagline>{t.auth.resetLead(username)}</Tagline>}
      </Reveal>
      <Reveal delay={140}>
        {invalid ? (
          <FormCard>
            <Caption>{t.auth.resetInvalidLink}</Caption>
          </FormCard>
        ) : (
          <FormCard as="form" onSubmit={handleSubmit}>
            <div style={{ position: 'relative' }}>
              <Label htmlFor="new-password">{t.auth.resetNewPassword}</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                aria-invalid={newError ? 'true' : undefined}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <Label htmlFor="confirm-password">{t.auth.resetConfirmPassword}</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                aria-invalid={confirmError ? 'true' : undefined}
              />
            </div>
            <Button type="submit" busy={busy} disabled={invalid || username === null}>
              {t.auth.resetSubmit}
            </Button>
          </FormCard>
        )}
      </Reveal>
    </Hero>
  );
}
