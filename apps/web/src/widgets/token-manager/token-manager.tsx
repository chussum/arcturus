'use client';

import { styled } from '@linaria/react';
import { type FormEvent, useState } from 'react';
import { createToken, listTokens, revokeToken } from '../../entities/token/api';
import { useI18n } from '../../shared/i18n/locale-context';
import { useAsyncAction } from '../../shared/lib/use-async-action';
import { usePoll } from '../../shared/lib/use-poll';
import { colors, font, fontStack, spacing, typography } from '../../shared/styles/tokens';
import {
  Button,
  Caption,
  Card,
  Eyebrow,
  Input,
  Reveal,
  Select,
  SubNavBar,
  SubNavTitle,
  TextButton,
} from '../../shared/ui';
import { useToast } from '../../shared/ui/toast';

const Page = styled.main`
  max-width: 660px;
  margin: 0 auto;
  padding: ${spacing.lg} ${spacing.lg} 120px;
  display: flex;
  flex-direction: column;
  gap: ${spacing.sm};
`;

const TokenValue = styled.code`
  display: block;
  font-family: ${fontStack.mono};
  font-size: 12px;
  background: ${colors.black};
  color: ${colors.accent};
  border: 1px solid ${colors.hairline};
  border-radius: 10px;
  padding: ${spacing.sm};
  margin: ${spacing.sm} 0 ${spacing.xs};
  word-break: break-all;
`;

const TokenRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${spacing.sm};
  padding: ${spacing.sm} 0;
  border-top: 1px solid ${colors.hairline};

  strong {
    ${font(typography.bodyStrong)}
    color: ${colors.text};
  }
`;

const CreateRow = styled.form`
  display: flex;
  align-items: center;
  gap: ${spacing.xs};
  margin-top: ${spacing.sm};
`;

/** Expiry presets offered at creation — must match the server's ALLOWED_EXPIRY_DAYS. */
const EXPIRY_OPTIONS = [30, 90, 365] as const;

/** CLI credentials: create, copy once, revoke. The plaintext never reappears. */
export function TokenManagerWidget() {
  const { t } = useI18n();
  const { notify } = useToast();
  const tokens = usePoll(listTokens);
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);

  const create = useAsyncAction(async () => {
    if (!name.trim()) return;
    const created = await createToken(name.trim(), expiresInDays);
    setFresh(created);
    setName('');
    tokens.refresh();
  });
  const revoke = useAsyncAction(async (id: string) => {
    await revokeToken(id);
    tokens.refresh();
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    void create.run();
  }

  return (
    <>
      <SubNavBar>
        <SubNavTitle>{t.tokens.title}</SubNavTitle>
      </SubNavBar>
      <Page>
        <Reveal>
          <Card style={{ padding: 24 }}>
            <Eyebrow>{t.tokens.newToken}</Eyebrow>
            <Caption>{t.tokens.cliHint}</Caption>
            <CreateRow onSubmit={handleCreate}>
              <Input
                placeholder={t.tokens.placeholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Select
                aria-label={t.tokens.expiry}
                value={expiresInDays ?? ''}
                onChange={(event) =>
                  setExpiresInDays(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">{t.tokens.expiryNever}</option>
                {EXPIRY_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {t.tokens.expiryDays(days)}
                  </option>
                ))}
              </Select>
              <Button type="submit" busy={create.busy}>
                {t.tokens.create}
              </Button>
            </CreateRow>
            {fresh && (
              <>
                <TokenValue>{fresh.token}</TokenValue>
                <Caption>
                  {t.tokens.copyOnce(fresh.name)}{' '}
                  <TextButton
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(fresh.token);
                      notify('success', t.common.copied);
                    }}
                  >
                    {t.common.copy}
                  </TextButton>
                </Caption>
              </>
            )}
          </Card>
        </Reveal>

        <Reveal delay={80}>
          <Card style={{ padding: 24 }}>
            <Eyebrow>{t.tokens.active}</Eyebrow>
            {tokens.data?.length === 0 && (
              <Caption style={{ marginTop: 8 }}>{t.tokens.none}</Caption>
            )}
            {tokens.data?.map((token) => (
              <TokenRow key={token.id}>
                <div>
                  <strong>{token.name}</strong>
                  <Caption>
                    {token.lastUsedAt
                      ? t.tokens.lastUsed(new Date(token.lastUsedAt).toLocaleString())
                      : t.tokens.neverUsed}
                    {' · '}
                    {tokenExpiryLabel(token.expiresAt, t)}
                  </Caption>
                </div>
                <TextButton
                  type="button"
                  danger
                  busy={revoke.busy}
                  onClick={() => void revoke.run(token.id)}
                >
                  {t.tokens.revoke}
                </TextButton>
              </TokenRow>
            ))}
          </Card>
        </Reveal>
      </Page>
    </>
  );
}

/** "never expires" / "expires <date>" / "expired" for a token's expiry timestamp. */
function tokenExpiryLabel(expiresAt: string | null, t: ReturnType<typeof useI18n>['t']): string {
  if (!expiresAt) return t.tokens.neverExpires;
  if (new Date(expiresAt).getTime() < Date.now()) return t.tokens.expired;
  return t.tokens.expiresOn(new Date(expiresAt).toLocaleDateString());
}
