'use client';

import type { UserProfile } from '@arcturus/shared';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { createInvite, deleteInvite, listInvites } from '../../entities/invite/api';
import { createResetLink, deleteUser, listUsers } from '../../entities/user/api';
import { useSession } from '../../features/auth/session-context';
import { useI18n } from '../../shared/i18n/locale-context';
import { copyText } from '../../shared/lib/clipboard';
import { useAsyncAction } from '../../shared/lib/use-async-action';
import { usePoll } from '../../shared/lib/use-poll';
import { colors, font, fontStack, spacing, typography } from '../../shared/styles/tokens';
import {
  Button,
  Caption,
  Card,
  ConfirmDialog,
  Eyebrow,
  Reveal,
  SubNavBar,
  SubNavTitle,
  TextButton,
} from '../../shared/ui';
import { useToast } from '../../shared/ui/toast';

const Page = styled.main`
  max-width: 840px;
  margin: 0 auto;
  padding: ${spacing.lg} ${spacing.lg} 120px;
  display: flex;
  flex-direction: column;
  gap: ${spacing.sm};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: ${spacing.sm};

  th {
    ${font(typography.eyebrow)}
    color: ${colors.textFaint};
    text-align: left;
    padding: 6px 0;
  }
  td {
    ${font(typography.caption)}
    color: ${colors.text};
    padding: 10px 0;
    border-top: 1px solid ${colors.hairline};
  }
`;

const InviteCode = styled.code`
  font-family: ${fontStack.mono};
  font-size: 12px;
  background: rgba(237, 233, 224, 0.05);
  border: 1px solid ${colors.hairline};
  border-radius: 8px;
  padding: 3px 10px;
  color: ${colors.accent};
`;

/** Admin-only: who is on the platform, and the invites that bring them in. */
export function TeamWidget() {
  const { user: me } = useSession();
  const { t } = useI18n();
  const { notify } = useToast();
  const users = usePoll(listUsers);
  const invites = usePoll(listInvites);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<UserProfile | null>(null);
  const [resetLink, setResetLink] = useState<{ username: string; url: string } | null>(null);

  const invite = useAsyncAction(async () => {
    const created = await createInvite();
    setJustCreated(created.code);
    invites.refresh();
  });
  const revokeInvite = useAsyncAction(async (id: string) => {
    await deleteInvite(id);
    invites.refresh();
  });
  const removeMember = useAsyncAction(async () => {
    if (!removeTarget) return;
    await deleteUser(removeTarget.id);
    setRemoveTarget(null);
    users.refresh();
  });
  const resetMember = useAsyncAction(async (userId: string, username: string) => {
    const result = await createResetLink(userId);
    const url = `${window.location.origin}/dashboard/reset/${result.token}`;
    setResetLink({ username, url });
  });

  function signupLink(code: string): string {
    return `${window.location.origin}/dashboard/signup/${code}`;
  }

  return (
    <>
      <SubNavBar>
        <SubNavTitle>{t.team.title}</SubNavTitle>
        <Button type="button" busy={invite.busy} onClick={() => void invite.run()}>
          {t.team.newInvite}
        </Button>
      </SubNavBar>
      <Page>
        {justCreated && (
          <Reveal>
            <Card style={{ padding: 24 }}>
              <Eyebrow>{t.team.inviteReady}</Eyebrow>
              <Caption>{t.team.inviteHint}</Caption>
              <p style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <InviteCode>{signupLink(justCreated)}</InviteCode>
                <TextButton
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(signupLink(justCreated));
                    notify(ok ? 'success' : 'error', ok ? t.common.copied : t.common.copyFailed);
                  }}
                >
                  {t.common.copy}
                </TextButton>
              </p>
            </Card>
          </Reveal>
        )}

        {resetLink && (
          <Reveal>
            <Card style={{ padding: 24 }}>
              <Eyebrow>{t.team.resetLinkReady}</Eyebrow>
              <Caption>{t.team.resetLinkHint}</Caption>
              <p style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <InviteCode>{resetLink.url}</InviteCode>
                <TextButton
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(resetLink.url);
                    notify(ok ? 'success' : 'error', ok ? t.common.copied : t.common.copyFailed);
                  }}
                >
                  {t.common.copy}
                </TextButton>
              </p>
            </Card>
          </Reveal>
        )}

        <Reveal delay={60}>
          <Card style={{ padding: 24 }}>
            <Eyebrow>{t.team.members}</Eyebrow>
            <Table>
              <thead>
                <tr>
                  <th>{t.team.username}</th>
                  <th>{t.team.role}</th>
                  <th>{t.team.joined}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.data?.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.role}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      {user.id !== me.id && (
                        <>
                          <TextButton
                            type="button"
                            busy={resetMember.busy}
                            onClick={() => void resetMember.run(user.id, user.username)}
                            style={{ marginRight: 12 }}
                          >
                            {t.team.resetPassword}
                          </TextButton>
                          <TextButton type="button" danger onClick={() => setRemoveTarget(user)}>
                            {t.team.remove}
                          </TextButton>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Reveal>

        <Reveal delay={120}>
          <Card style={{ padding: 24 }}>
            <Eyebrow>{t.team.invites}</Eyebrow>
            <Table>
              <thead>
                <tr>
                  <th>{t.team.code}</th>
                  <th>{t.team.memo}</th>
                  <th>{t.team.status}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invites.data?.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <InviteCode>{row.code}</InviteCode>
                    </td>
                    <td>{row.memo ?? '—'}</td>
                    <td>
                      {row.usedBy
                        ? t.team.usedBy(row.usedBy)
                        : new Date(row.expiresAt) < new Date()
                          ? t.team.expired
                          : t.team.open}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!row.usedBy && (
                        <TextButton
                          type="button"
                          busy={revokeInvite.busy}
                          onClick={() => void revokeInvite.run(row.id)}
                        >
                          {t.team.revoke}
                        </TextButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Reveal>
      </Page>

      <ConfirmDialog
        open={removeTarget !== null}
        title={removeTarget ? t.team.confirmRemove(removeTarget.username) : ''}
        confirmLabel={t.team.remove}
        cancelLabel={t.common.cancel}
        busy={removeMember.busy}
        onConfirm={() => void removeMember.run()}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}
