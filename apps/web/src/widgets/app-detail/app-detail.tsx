'use client';

import type {
  AppShareEntry,
  AppSummary,
  DeploymentSummary,
  ShareableUser,
  ShareRole,
} from '@arcturus/shared';
import { AppStatus, RouteMode } from '@arcturus/shared';
import { styled } from '@linaria/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  deleteApp,
  getApp,
  getAppSharing,
  listAppDeployments,
  listShareableUsers,
  restartApp,
  rollbackApp,
  setMemoryLimit,
  setRouteMode,
  stopApp,
  updateAppDescription,
  updateAppEnv,
  updateAppSharing,
} from '../../entities/app/api';
import { followAppLogs } from '../../entities/deployment/api';
import { RedeployButton } from '../../features/deploy-app/redeploy-button';
import { useI18n } from '../../shared/i18n/locale-context';
import { useAsyncAction } from '../../shared/lib/use-async-action';
import { usePoll } from '../../shared/lib/use-poll';
import { colors, font, fontStack, motion, spacing, typography } from '../../shared/styles/tokens';
import {
  Button,
  Caption,
  Card,
  ConfirmDialog,
  DeploymentStatusBadge,
  Eyebrow,
  Mono,
  Reveal,
  StatusBadge,
  SubNavBar,
  SubNavTitle,
  TextButton,
} from '../../shared/ui';
import { EnvEditor } from './env-editor';
import { LogConsole } from './log-console';

const Page = styled.main`
  max-width: 1100px;
  margin: 0 auto;
  padding: ${spacing.lg} ${spacing.lg} 120px;
  display: flex;
  flex-direction: column;
  gap: ${spacing.sm};
`;

const HeadRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  min-width: 0;
`;

const Actions = styled.div`
  display: flex;
  gap: ${spacing.xs};
  flex-wrap: wrap;
`;

const DescriptionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const DescriptionInput = styled.input`
  ${font(typography.caption)}
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: ${colors.textMuted};
  padding: 2px 0;
  transition: border-color ${motion.color}, color ${motion.color};

  &::placeholder {
    color: ${colors.textFaint};
  }
  &:hover {
    border-bottom-color: ${colors.hairlineStrong};
  }
  &:focus-visible {
    outline: none;
    border-bottom-color: ${colors.accent};
    color: ${colors.text};
  }
`;

const ReadOnlyDescription = styled.p`
  ${font(typography.caption)}
  color: ${colors.textMuted};
`;

const ReadOnlyNotice = styled.p`
  ${font(typography.caption)}
  color: ${colors.textFaint};
  font-style: italic;
`;

const SharingHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const SharingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid ${colors.hairline};
`;

const SharingLabel = styled.span`
  ${font(typography.caption)}
  color: ${colors.text};
  flex: 1;
  min-width: 0;
`;

const SharingSelect = styled.select`
  ${font(typography.caption)}
  background: ${colors.surface2};
  border: 1px solid ${colors.hairline};
  border-radius: 8px;
  color: ${colors.text};
  padding: 4px 8px;
  min-width: 110px;

  &:focus-visible {
    outline: none;
    border-color: ${colors.accent};
  }
`;

const InfoGrid = styled(Card)`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px ${spacing.lg};
  padding: 20px 24px;

  dt {
    ${font(typography.eyebrow)}
    color: ${colors.textFaint};
    align-self: center;
  }
  dd {
    ${font(typography.caption)}
    color: ${colors.text};
  }
  dd a {
    font-family: ${fontStack.mono};
    font-size: 12px;
  }
`;

/** Capped like LogViewer — a long history scrolls inside its card instead of stretching the page. */
const HistoryList = styled.ol`
  list-style: none;
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 2px;
`;

const HistoryRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  padding: 10px 0;
  border-top: 1px solid ${colors.hairline};

  &:first-of-type {
    border-top: none;
  }
`;

const HistoryWhen = styled.span`
  ${font(typography.caption)}
  color: ${colors.text};
  flex: 1;
  min-width: 0;
`;

const LiveMark = styled.span`
  font-family: ${fontStack.mono};
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${colors.accent};
  background: ${colors.accentWash};
  border: 1px solid rgba(217, 130, 59, 0.35);
  border-radius: 9999px;
  padding: 2px 9px;
`;

const PrunedMark = styled(Mono)`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${colors.textFaint};
`;

/** Eyebrow variant for flex-row contexts — same typography, no bottom margin. */
const LogSectionLabel = styled.span`
  font-family: ${fontStack.mono};
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${colors.accent};
`;

const LogCardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
  & > :last-child {
    margin-left: auto;
  }
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: ${colors.textFaint};
  cursor: pointer;
  transition: background ${motion.color}, border-color ${motion.color}, color ${motion.color};

  &:hover {
    background: ${colors.surface3};
    border-color: ${colors.hairline};
    color: ${colors.text};
  }
`;

const LogOverlayBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(11, 10, 6, 0.75);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: arcturus-fade-in 160ms ease-out;

  @keyframes arcturus-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

const LogOverlayPanel = styled.div`
  width: 100%;
  height: 100%;
  background: ${colors.surface2};
  border: 1px solid ${colors.hairlineStrong};
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: arcturus-panel-in 200ms cubic-bezier(0.21, 0.8, 0.32, 1);

  @keyframes arcturus-panel-in {
    from { opacity: 0; transform: scale(0.98); }
    to   { opacity: 1; transform: scale(1);    }
  }
`;

const LogOverlayHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
  flex-shrink: 0;
  & > :last-child {
    margin-left: auto;
  }
`;

export function AppDetailWidget({ appId }: { appId: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { data: app, refresh } = usePoll(() => getApp(appId), 5000);
  const history = usePoll(() => listAppDeployments(appId), 10000);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState<DeploymentSummary | null>(null);
  const [logsFullscreen, setLogsFullscreen] = useState(false);
  const isContainer = app?.type === 'container';
  const canManage = app?.viewerRole !== 'view';
  const canConfigure = app?.viewerRole === 'owner' || app?.viewerRole === 'admin';

  const restart = useAsyncAction(() => restartApp(appId).then(refresh));
  const stop = useAsyncAction(() => stopApp(appId).then(refresh));
  const remove = useAsyncAction(async () => {
    await deleteApp(appId);
    router.replace('/apps');
  });
  const rollback = useAsyncAction(
    async (deploymentId: string) => {
      await rollbackApp(appId, deploymentId);
      setConfirmRollback(null);
      refresh();
      history.refresh();
    },
    { successMessage: t.appDetail.rolledBack },
  );
  const switchRoute = useAsyncAction(async () => {
    if (!app) return;
    await setRouteMode(
      appId,
      app.routeMode === RouteMode.Proxy ? RouteMode.Redirect : RouteMode.Proxy,
    );
    refresh();
  });

  useEffect(() => {
    if (app) document.title = `${app.name} — Arcturus`;
  }, [app]);

  // Docker ends a follow stream whenever the container stops, including the stop
  // half of an in-place restart. Mark the stop in the log, then re-follow once the
  // app is running again — via the status flip (stop → restart) or, when the status
  // never left "running" (restart button), via a delayed epoch bump.
  const appRunning = app?.status === AppStatus.Running;
  const appRunningRef = useRef(appRunning);
  appRunningRef.current = appRunning;
  const [logEpoch, setLogEpoch] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: t is stable per locale; appRunning/logEpoch drive resubscription
  useEffect(() => {
    if (!isContainer) return;
    setLogLines([]); // the server replays the last 200 lines on every (re)subscribe
    let retry: ReturnType<typeof setTimeout> | undefined;
    const dispose = followAppLogs(
      appId,
      (line) => setLogLines((lines) => [...lines.slice(-499), line]),
      () => {
        setLogLines((lines) => [...lines, t.appDetail.containerStopped]);
        retry = setTimeout(() => {
          if (appRunningRef.current) setLogEpoch((n) => n + 1);
        }, 2000);
      },
    );
    return () => {
      if (retry) clearTimeout(retry);
      dispose();
    };
  }, [appId, isContainer, appRunning, logEpoch]);

  // Close fullscreen log overlay on Escape.
  useEffect(() => {
    if (!logsFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLogsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [logsFullscreen]);

  if (!app) return null;

  const hostname = typeof window === 'undefined' ? '127.0.0.1' : window.location.hostname;
  const isDevServer = typeof window !== 'undefined' && window.location.port === '3000';
  // Deployed apps live on the apps origin (ARCTURUS_APPS_PORT, default 7778).
  // In production the relative link hits the control plane, which 302-redirects
  // to that origin; in dev (dashboard on :3000) we point at it directly.
  const pathUrl = isDevServer ? `http://${hostname}:7778${app.path}/` : `${app.path}/`;
  const portUrl = app.assignedPort ? `http://${hostname}:${app.assignedPort}/` : null;

  function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US');
  }

  return (
    <>
      <SubNavBar>
        <HeadRow>
          <TextButton type="button" onClick={() => router.push('/apps')}>
            ← {t.appDetail.back}
          </TextButton>
          <SubNavTitle>{app.name}</SubNavTitle>
          <StatusBadge status={app.status} />
        </HeadRow>
        <Actions>
          {canManage && (
            <RedeployButton
              app={app}
              onDeployed={() => {
                refresh();
                history.refresh();
              }}
            />
          )}
          {isContainer && canManage && (
            <>
              <Button
                type="button"
                variant="ghost"
                busy={restart.busy}
                onClick={() => void restart.run()}
              >
                {t.appDetail.restart}
              </Button>
              <Button
                type="button"
                variant="ghost"
                busy={stop.busy}
                onClick={() => void stop.run()}
              >
                {t.appDetail.stop}
              </Button>
            </>
          )}
          {canConfigure && (
            <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
              {t.appDetail.delete}
            </Button>
          )}
        </Actions>
      </SubNavBar>

      <Page>
        <Reveal>
          {canManage ? (
            <DescriptionEditor app={app} onSaved={refresh} />
          ) : app.description ? (
            <ReadOnlyDescription>{app.description}</ReadOnlyDescription>
          ) : null}
        </Reveal>

        {app.viewerRole === 'view' && (
          <Reveal>
            <ReadOnlyNotice>{t.appDetail.sharingReadOnly}</ReadOnlyNotice>
          </Reveal>
        )}

        <Reveal delay={60}>
          <InfoGrid as="dl">
            <dt>{t.appDetail.url}</dt>
            <dd>
              <a href={pathUrl} target="_blank" rel="noreferrer">
                {app.path}/
              </a>
            </dd>
            {portUrl && (
              <>
                <dt>{t.appDetail.dedicatedPort}</dt>
                <dd>
                  <a href={portUrl} target="_blank" rel="noreferrer">
                    {portUrl}
                  </a>{' '}
                  <Caption as="span">{t.appDetail.dedicatedPortHint}</Caption>
                </dd>
              </>
            )}
            <dt>{t.appDetail.status}</dt>
            <dd>
              <StatusBadge status={app.status} />
            </dd>
            <dt>{t.appDetail.type}</dt>
            <dd>{app.type}</dd>
            <dt>{t.appDetail.owner}</dt>
            <dd>{app.ownerUsername}</dd>
            {isContainer && (
              <>
                <dt>{t.appDetail.routing}</dt>
                <dd>
                  {app.routeMode === RouteMode.Proxy
                    ? t.appDetail.pathProxy(app.path)
                    : t.appDetail.redirectToPort(String(app.assignedPort ?? '—'))}{' '}
                  {canManage && (
                    <TextButton
                      type="button"
                      busy={switchRoute.busy}
                      onClick={() => void switchRoute.run()}
                    >
                      {t.appDetail.switch}
                    </TextButton>
                  )}
                </dd>
                <dt>{t.appDetail.memoryLimit}</dt>
                <dd>
                  {canManage ? (
                    <MemoryLimitField app={app} onSaved={refresh} />
                  ) : (
                    <span>{app.memoryLimitMb ?? '—'} MB</span>
                  )}
                </dd>
              </>
            )}
            <dt>{t.appDetail.lastDeployed}</dt>
            <dd>{app.lastDeployedAt ? formatWhen(app.lastDeployedAt) : t.appDetail.never}</dd>
          </InfoGrid>
        </Reveal>

        {canConfigure && (
          <Reveal delay={110}>
            <SharingCard appId={appId} ownerUsername={app.ownerUsername} onSaved={refresh} />
          </Reveal>
        )}

        <Reveal delay={160}>
          <Card style={{ padding: 24 }}>
            <Eyebrow>{t.appDetail.history}</Eyebrow>
            <HistoryList>
              {history.data?.map((deployment) => (
                <HistoryRow key={deployment.id}>
                  <DeploymentStatusBadge status={deployment.status} />
                  <HistoryWhen>
                    {formatWhen(deployment.createdAt)}
                    <br />
                    <Mono style={{ fontSize: 10 }}>{deployment.id}</Mono>
                  </HistoryWhen>
                  {deployment.active &&
                    (app.status === AppStatus.Running ? (
                      <LiveMark>{t.appDetail.live}</LiveMark>
                    ) : (
                      <PrunedMark>{t.appDetail.liveStopped}</PrunedMark>
                    ))}
                  {deployment.rollbackable && (
                    <TextButton
                      type="button"
                      busy={rollback.busy && confirmRollback?.id === deployment.id}
                      onClick={() => setConfirmRollback(deployment)}
                    >
                      {t.appDetail.rollback}
                    </TextButton>
                  )}
                  {!deployment.rollbackable &&
                    !deployment.active &&
                    deployment.status === 'running' && (
                      <PrunedMark>{t.appDetail.pruned}</PrunedMark>
                    )}
                </HistoryRow>
              ))}
            </HistoryList>
          </Card>
        </Reveal>

        {isContainer && canManage && (
          <Reveal delay={210}>
            <EnvEditor app={app} onSave={(env) => updateAppEnv(app.id, env).then(refresh)} />
          </Reveal>
        )}

        {isContainer && canManage && (
          <Reveal delay={260}>
            <Card style={{ padding: 24 }}>
              <LogCardHeader>
                <LogSectionLabel>{t.appDetail.logsTitle}</LogSectionLabel>
                {appRunning && <LiveMark>{t.appDetail.live}</LiveMark>}
                <IconButton
                  type="button"
                  aria-label={t.appDetail.expandLogs}
                  onClick={() => setLogsFullscreen(true)}
                >
                  {/* corners-out / expand icon */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </IconButton>
              </LogCardHeader>
              <LogConsole lines={logLines} placeholder={t.appDetail.waitingLogs} />
            </Card>
          </Reveal>
        )}
      </Page>

      <ConfirmDialog
        open={confirmDelete}
        title={t.appDetail.confirmDelete(app.name)}
        body={t.appDetail.confirmDeleteBody}
        confirmLabel={t.appDetail.delete}
        cancelLabel={t.common.cancel}
        busy={remove.busy}
        onConfirm={() => void remove.run()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmRollback !== null}
        title={
          confirmRollback ? t.appDetail.confirmRollback(formatWhen(confirmRollback.createdAt)) : ''
        }
        confirmLabel={t.appDetail.rollback}
        cancelLabel={t.common.cancel}
        danger={false}
        busy={rollback.busy}
        onConfirm={() => confirmRollback && void rollback.run(confirmRollback.id)}
        onCancel={() => setConfirmRollback(null)}
      />

      {logsFullscreen && (
        <LogOverlayBackdrop
          onClick={(event) => {
            if (event.target === event.currentTarget) setLogsFullscreen(false);
          }}
        >
          <LogOverlayPanel>
            <LogOverlayHeader>
              <LogSectionLabel>{t.appDetail.logsTitle}</LogSectionLabel>
              {appRunning && <LiveMark>{t.appDetail.live}</LiveMark>}
              <IconButton
                type="button"
                aria-label={t.appDetail.collapseLogs}
                onClick={() => setLogsFullscreen(false)}
              >
                {/* corners-in / collapse icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M5.5 2v3.5H2M14 5.5h-3.5V2M10.5 14v-3.5H14M2 10.5h3.5V14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </IconButton>
            </LogOverlayHeader>
            <LogConsole lines={logLines} placeholder={t.appDetail.waitingLogs} fullscreen />
          </LogOverlayPanel>
        </LogOverlayBackdrop>
      )}
    </>
  );
}

/** Mirrors the server's ARCTURUS_DEFAULT_MEMORY_MB; shown only as a placeholder hint. */
const DEFAULT_MEMORY_MB = 1024;

const MemoryRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const MemoryInput = styled.input`
  ${font(typography.caption)}
  width: 70px;
  font-family: ${fontStack.mono};
  background: ${colors.surface2};
  border: 1px solid ${colors.hairline};
  border-radius: 8px;
  color: ${colors.text};
  padding: 4px 8px;

  &:focus-visible {
    outline: none;
    border-color: ${colors.accent};
  }
`;

/** Inline memory-limit editor for container apps — type MB, save to recreate the container. */
function MemoryLimitField({ app, onSaved }: { app: AppSummary; onSaved: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(app.memoryLimitMb?.toString() ?? '');

  useEffect(() => {
    setValue(app.memoryLimitMb?.toString() ?? '');
  }, [app.memoryLimitMb]);

  const save = useAsyncAction(
    async () => {
      const mb = Number.parseInt(value, 10);
      if (!Number.isInteger(mb) || mb < 1) return;
      if (mb === app.memoryLimitMb) return;
      await setMemoryLimit(app.id, mb);
      onSaved();
    },
    { successMessage: t.appDetail.memoryLimitSaved },
  );

  const parsed = Number.parseInt(value, 10);
  const dirty = Number.isInteger(parsed) && parsed >= 1 && parsed !== app.memoryLimitMb;

  return (
    <MemoryRow>
      <MemoryInput
        type="number"
        min={1}
        inputMode="numeric"
        value={value}
        placeholder={t.appDetail.memoryLimitDefault(DEFAULT_MEMORY_MB)}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && dirty) void save.run();
        }}
      />
      <Caption as="span">{t.appDetail.memoryLimitUnit}</Caption>
      {dirty && (
        <TextButton type="button" busy={save.busy} onClick={() => void save.run()}>
          {t.appDetail.save}
        </TextButton>
      )}
    </MemoryRow>
  );
}

/** Quiet inline description editor — click, type, blur or Enter to save. */
function DescriptionEditor({ app, onSaved }: { app: AppSummary; onSaved: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(app.description ?? '');
  const save = useAsyncAction(
    async () => {
      if (value.trim() === (app.description ?? '')) return;
      await updateAppDescription(app.id, value);
      onSaved();
    },
    { successMessage: t.appDetail.descriptionSaved },
  );

  useEffect(() => {
    setValue(app.description ?? '');
  }, [app.description]);

  return (
    <DescriptionRow>
      <DescriptionInput
        value={value}
        placeholder={t.appDetail.descriptionEmpty}
        maxLength={200}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save.run()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
      />
    </DescriptionRow>
  );
}

/** Owner/admin-only sharing controls — toggle team-wide access and grant per-user view/manage. */
function SharingCard({
  appId,
  ownerUsername,
  onSaved,
}: {
  appId: string;
  ownerUsername: string;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { data: sharing, refresh: refreshSharing } = usePoll(() => getAppSharing(appId), 30000);
  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ShareRole>('view');
  const [everyoneRole, setEveryoneRole] = useState<string>('off');
  const [shares, setShares] = useState<AppShareEntry[]>([]);

  // Sync local state from fetched sharing config
  useEffect(() => {
    if (sharing) {
      setEveryoneRole(sharing.sharedAll ?? 'off');
      setShares(sharing.shares);
    }
  }, [sharing]);

  // Load shareable users once
  useEffect(() => {
    listShareableUsers()
      .then(setUsers)
      .catch(() => {});
  }, []);

  const save = useAsyncAction(
    async () => {
      await updateAppSharing(appId, {
        sharedAll: everyoneRole === 'off' ? null : (everyoneRole as ShareRole),
        shares: shares.map((s) => ({ userId: s.userId, role: s.role })),
      });
      refreshSharing();
      onSaved();
    },
    { successMessage: t.appDetail.sharingSaved },
  );

  function addUser() {
    if (!selectedUserId || shares.some((s) => s.userId === selectedUserId)) return;
    const user = users.find((u) => u.id === selectedUserId);
    if (!user) return;
    setShares((prev) => [
      ...prev,
      { userId: selectedUserId, username: user.username, role: selectedRole },
    ]);
    setSelectedUserId('');
  }

  function removeShare(userId: string) {
    setShares((prev) => prev.filter((s) => s.userId !== userId));
  }

  function updateShareRole(userId: string, role: ShareRole) {
    setShares((prev) => prev.map((s) => (s.userId === userId ? { ...s, role } : s)));
  }

  if (!sharing) return null;

  const availableUsers = users.filter(
    (u) => u.username !== ownerUsername && !shares.some((s) => s.userId === u.id),
  );

  return (
    <Card style={{ padding: 24 }}>
      <SharingHeader>
        <Eyebrow>{t.appDetail.sharingTitle}</Eyebrow>
        <TextButton type="button" busy={save.busy} onClick={() => void save.run()}>
          {t.appDetail.save}
        </TextButton>
      </SharingHeader>

      <SharingRow>
        <SharingLabel>{t.appDetail.sharingEveryoneLabel}</SharingLabel>
        <SharingSelect value={everyoneRole} onChange={(e) => setEveryoneRole(e.target.value)}>
          <option value="off">{t.appDetail.sharingEveryoneOff}</option>
          <option value="view">{t.appDetail.sharingEveryoneView}</option>
          <option value="manage">{t.appDetail.sharingEveryoneManage}</option>
        </SharingSelect>
      </SharingRow>

      <SharingRow>
        <SharingLabel>
          {ownerUsername}{' '}
          <Caption as="span" style={{ color: 'inherit', opacity: 0.5 }}>
            ({t.appDetail.owner})
          </Caption>
        </SharingLabel>
        <SharingSelect value="manage" disabled>
          <option value="manage">{t.appDetail.sharingEveryoneManage}</option>
        </SharingSelect>
      </SharingRow>

      {shares.map((share) => (
        <SharingRow key={share.userId}>
          <SharingLabel>{share.username}</SharingLabel>
          <SharingSelect
            value={share.role}
            onChange={(e) => updateShareRole(share.userId, e.target.value as ShareRole)}
          >
            <option value="view">{t.appDetail.sharingEveryoneView}</option>
            <option value="manage">{t.appDetail.sharingEveryoneManage}</option>
          </SharingSelect>
          <TextButton type="button" onClick={() => removeShare(share.userId)}>
            {t.appDetail.sharingRemove}
          </TextButton>
        </SharingRow>
      ))}

      {availableUsers.length > 0 && (
        <SharingRow>
          <SharingSelect value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            <option value="">{t.appDetail.sharingAddUser}</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </SharingSelect>
          <SharingSelect
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as ShareRole)}
          >
            <option value="view">{t.appDetail.sharingEveryoneView}</option>
            <option value="manage">{t.appDetail.sharingEveryoneManage}</option>
          </SharingSelect>
          <TextButton type="button" onClick={addUser} disabled={!selectedUserId}>
            +
          </TextButton>
        </SharingRow>
      )}
    </Card>
  );
}
