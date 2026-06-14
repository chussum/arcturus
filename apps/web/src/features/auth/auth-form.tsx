'use client';

import { styled } from '@linaria/react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { login, signup } from '../../entities/user/api';
import { useI18n } from '../../shared/i18n/locale-context';
import { useAsyncAction } from '../../shared/lib/use-async-action';
import { colors, font, spacing, typography } from '../../shared/styles/tokens';
import { Button, Caption, Card, Eyebrow, Input, Label, Reveal, SerifTitle } from '../../shared/ui';

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

interface AuthFormProps {
  /** Present only on the invite signup screen. */
  inviteCode?: string;
}

/** The front door: one italic-serif editorial moment over the warm void. */
export function AuthForm({ inviteCode }: AuthFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const isSignup = inviteCode !== undefined;

  const { run, busy } = useAsyncAction(async () => {
    await (isSignup ? signup(inviteCode, username, password) : login(username, password));
    router.replace('/apps');
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void run();
  }

  return (
    <Hero>
      <Reveal>
        <BrandEyebrow as="p">Arcturus</BrandEyebrow>
        <SerifTitle>{t.auth.tagline}</SerifTitle>
        <Tagline>deploy · rollback · observe</Tagline>
      </Reveal>
      <Reveal delay={140}>
        <FormCard as="form" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="username">{t.auth.username}</Label>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="password">{t.auth.password}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>
          <Button type="submit" busy={busy}>
            {isSignup ? t.auth.createAccount : t.auth.signIn}
          </Button>
          {isSignup && <Caption>{t.auth.joiningWith(inviteCode)}</Caption>}
        </FormCard>
      </Reveal>
    </Hero>
  );
}
