'use client';

import type { AppSummary } from '@arcturus/shared';
import { styled } from '@linaria/react';
import Link from 'next/link';
import { listApps } from '../../entities/app/api';
import { DeployForm } from '../../features/deploy-app/deploy-form';
import { useI18n } from '../../shared/i18n/locale-context';
import { usePoll } from '../../shared/lib/use-poll';
import { colors, font, fontStack, spacing, typography } from '../../shared/styles/tokens';
import {
  DashedPanel,
  InteractiveCard,
  Reveal,
  SerifTitle,
  StatusBadge,
  SubNavBar,
  SubNavTitle,
} from '../../shared/ui';
import { CliGuide } from './cli-guide';

const Page = styled.main`
  max-width: 1100px;
  margin: 0 auto;
  padding: ${spacing.lg} ${spacing.lg} 120px;
  display: flex;
  flex-direction: column;
  gap: ${spacing.md};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: ${spacing.sm};

  /* equalize card heights within a row: Reveal div → link → card all stretch */
  > div {
    height: 100%;
  }
  a {
    display: block;
    height: 100%;
  }
`;

const CardBody = styled(InteractiveCard)`
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
`;

const AppName = styled.h3`
  ${font(typography.bodyStrong)}
  color: ${colors.text};
`;

const AppDescription = styled.p`
  ${font(typography.caption)}
  color: ${colors.textMuted};
  margin-top: 3px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Meta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* pinned to the card bottom so meta lines align across the row */
  margin-top: auto;
  padding-top: ${spacing.sm};
`;

const AppPath = styled.span`
  font-family: ${fontStack.mono};
  font-size: 11px;
  color: ${colors.accent};
`;

const MetaInfo = styled.span`
  font-family: ${fontStack.mono};
  font-size: 11px;
  color: ${colors.textFaint};
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
`;

const SharedBadge = styled.span`
  font-family: ${fontStack.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${colors.accent};
  background: ${colors.accentWash};
  border: 1px solid rgba(217, 130, 59, 0.3);
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 4px;
`;

const CardTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${spacing.xs};
`;

const EmptyTitle = styled(SerifTitle)`
  font-size: 36px;
`;

export function AppListWidget() {
  const { t } = useI18n();
  const { data: apps, refresh } = usePoll(listApps, 5000);

  return (
    <>
      <SubNavBar>
        <SubNavTitle>{t.appList.title}</SubNavTitle>
      </SubNavBar>
      <Page>
        <Reveal>
          <DeployForm onDeployed={refresh} />
        </Reveal>

        <Reveal delay={60}>
          <CliGuide />
        </Reveal>

        {apps && apps.length === 0 && (
          <Reveal delay={120}>
            <DashedPanel>
              <EmptyTitle as="p">{t.appList.emptyTitle}</EmptyTitle>
              <p style={{ marginTop: 8 }}>{t.appList.emptyLead}</p>
            </DashedPanel>
          </Reveal>
        )}

        <Grid>
          {apps?.map((app, index) => (
            <Reveal key={app.id} delay={120 + index * 60}>
              <AppCard app={app} />
            </Reveal>
          ))}
        </Grid>
      </Page>
    </>
  );
}

function AppCard({ app }: { app: AppSummary }) {
  const { t } = useI18n();
  return (
    <Link href={`/apps/${app.id}`}>
      <CardBody>
        <CardTop>
          <div>
            <AppName>{app.name}</AppName>
            {app.description && <AppDescription>{app.description}</AppDescription>}
          </div>
          <StatusBadge status={app.status} />
        </CardTop>
        <Meta>
          <AppPath>{app.path}</AppPath>
          <MetaInfo>
            {app.type === 'container'
              ? t.appList.container(String(app.assignedPort ?? '—'))
              : t.appList.staticSite}
            <span>·</span>
            {app.ownerUsername}
            {(app.viewerRole === 'manage' || app.viewerRole === 'view') && (
              <SharedBadge>{t.appList.sharedBadge}</SharedBadge>
            )}
          </MetaInfo>
        </Meta>
      </CardBody>
    </Link>
  );
}
