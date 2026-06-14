import { AppStatus, AppType } from '@arcturus/shared';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../common/config/app-config';
import { AppsRepository } from '../../../infrastructure/persistence/repositories/apps.repository.port';
import { DeploymentsRepository } from '../../../infrastructure/persistence/repositories/deployments.repository.port';
import { StaticSitesService } from '../../../infrastructure/storage/static-sites.service';
import { type DeployContext, DeployStrategy } from './deploy-strategy';

@Injectable()
export class StaticDeployStrategy extends DeployStrategy {
  readonly type = AppType.Static;

  constructor(
    private readonly staticSites: StaticSitesService,
    private readonly apps: AppsRepository,
    private readonly deployments: DeploymentsRepository,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async deploy(context: DeployContext): Promise<void> {
    const { app, owner, deploymentId, projectDir, log } = context;

    await log('Publishing static site...');
    this.staticSites.publish(owner.username, app.name, deploymentId, projectDir);
    await this.apps.update(app.id, {
      status: AppStatus.Running,
      activeDeploymentId: deploymentId,
      lastDeployedAt: new Date().toISOString(),
    });

    await this.pruneOldReleases(context);
    await log(`Live at http://<host>:${this.config.appsPort}/${owner.username}/${app.name}/`);
  }

  private async pruneOldReleases(context: DeployContext): Promise<void> {
    const { app, owner, deploymentId } = context;
    const history = await this.deployments.listByApp(app.id);
    const keep = [
      deploymentId,
      ...history.filter((d) => d.status === 'running').map((d) => d.id),
    ].slice(0, this.config.keepReleases);
    this.staticSites.pruneReleases(owner.username, app.name, keep);
  }
}
