import fs from 'node:fs';
import path from 'node:path';
import type { DeploymentDetail, DeploymentSummary } from '@arcturus/shared';
import { AppStatus, AppType, DeploymentStatus, RouteMode } from '@arcturus/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { AppConfig } from '../../common/config/app-config';
import { LocalizedBadRequest, LocalizedNotFound } from '../../common/i18n/localized.exception';
import { EnvCryptoService } from '../../infrastructure/crypto/env-crypto.service';
import type {
  AppRow,
  DeploymentRow,
  UserRow,
} from '../../infrastructure/persistence/drizzle/schema';
import { AppsRepository } from '../../infrastructure/persistence/repositories/apps.repository.port';
import { DeploymentsRepository } from '../../infrastructure/persistence/repositories/deployments.repository.port';
import { ArchiveService } from '../../infrastructure/storage/archive.service';
import { AppsService } from '../apps/apps.service';
import { assertValidEnv } from '../apps/container-env';
import { DEPLOY_STRATEGIES, type DeployStrategy } from './pipeline/deploy-strategy';

/** App names share the username charset: they form the second URL segment. */
const APP_NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly apps: AppsRepository,
    private readonly appsService: AppsService,
    private readonly deployments: DeploymentsRepository,
    private readonly archives: ArchiveService,
    private readonly envCrypto: EnvCryptoService,
    @Inject(DEPLOY_STRATEGIES) private readonly strategies: DeployStrategy[],
  ) {}

  /**
   * Accepts an uploaded archive, figures out the app type and kicks off the
   * pipeline. Returns immediately with the queued deployment so clients can
   * poll or stream the build log.
   */
  async create(
    requester: UserRow,
    appName: string,
    archivePath: string,
    options: {
      /** Deploy to this owner's shared app (manage+) instead of the requester's own account. */
      ownerUsername?: string;
      explicitType?: AppType;
      description?: string;
      originalName?: string;
      env?: Record<string, string>;
    } = {},
  ): Promise<DeploymentSummary> {
    if (!APP_NAME_PATTERN.test(appName)) {
      throw new LocalizedBadRequest('deployments.appNamePattern');
    }

    const isSingleHtml = /\.html?$/i.test(options.originalName ?? '');
    if (isSingleHtml && options.explicitType === AppType.Container) {
      throw new LocalizedBadRequest('deployments.singleHtmlStaticOnly');
    }

    // nanoid, not a timestamp: two same-millisecond deploys must never share
    // (and cross-contaminate) an extraction directory.
    const workDir = path.join(this.config.buildsDir, `extract-${nanoid()}`);
    let projectDir: string;
    try {
      if (isSingleHtml) {
        // One-file sites: whatever the file was called, it becomes the index.
        fs.mkdirSync(workDir, { recursive: true });
        fs.copyFileSync(archivePath, path.join(workDir, 'index.html'));
        projectDir = workDir;
      } else {
        projectDir = this.archives.extract(archivePath, workDir);
      }
    } finally {
      fs.rmSync(archivePath, { force: true });
    }

    const type = isSingleHtml
      ? AppType.Static
      : (options.explicitType ?? this.detectType(projectDir));
    const { app, owner } = await this.resolveDeployTarget(requester, appName, type, options);
    const deployment = await this.deployments.create(app.id);

    // Fire and forget: the pipeline reports through deployment status + log.
    void this.runPipeline(app, owner, deployment, projectDir, workDir);

    return this.toSummary(deployment, app);
  }

  /**
   * Resolves the app to deploy to and its real owner. Without `ownerUsername` (or when it is the
   * requester's own name) this is the classic own-account create-or-update. With a different
   * `ownerUsername` it targets that owner's existing shared app, requiring manage+ on it — apps
   * are never created under another account.
   */
  private async resolveDeployTarget(
    requester: UserRow,
    appName: string,
    type: AppType,
    options: { ownerUsername?: string; description?: string; env?: Record<string, string> },
  ): Promise<{ app: AppRow; owner: UserRow }> {
    const { ownerUsername } = options;
    if (!ownerUsername || ownerUsername === requester.username) {
      const app = await this.findOrCreateApp(
        requester,
        appName,
        type,
        options.description,
        options.env,
      );
      return { app, owner: requester };
    }

    const { app, owner } = await this.appsService.resolveManagedAppByRef(
      ownerUsername,
      appName,
      requester,
    );
    this.assertTypeMatches(app, type, appName);
    // Deploy-supplied env is ignored for an existing app (same rule as an own redeploy).
    return { app, owner };
  }

  async getDetail(id: string, requester: UserRow): Promise<DeploymentDetail> {
    const deployment = await this.deployments.findById(id);
    if (!deployment) throw new LocalizedNotFound('deployments.deploymentNotFound');
    const app = await this.requireVisibleApp(deployment.appId, requester);
    return { ...this.toSummary(deployment, app), buildLog: deployment.buildLog };
  }

  private async runPipeline(
    app: AppRow,
    owner: UserRow,
    deployment: DeploymentRow,
    projectDir: string,
    workDir: string,
  ): Promise<void> {
    const log = (line: string) => this.deployments.appendBuildLog(deployment.id, `${line}\n`);

    try {
      await this.deployments.setStatus(deployment.id, DeploymentStatus.Building);
      await log(`Deploying ${owner.username}/${app.name} (${app.type})`);

      const strategy = this.strategies.find((candidate) => candidate.type === app.type);
      if (!strategy) throw new Error(`No deploy strategy registered for type "${app.type}"`);

      await strategy.deploy({ app, owner, deploymentId: deployment.id, projectDir, log });
      await this.deployments.setStatus(
        deployment.id,
        DeploymentStatus.Running,
        new Date().toISOString(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Deployment ${deployment.id} failed: ${message}`);
      await log(`ERROR: ${message}`);
      await this.deployments.setStatus(
        deployment.id,
        DeploymentStatus.Failed,
        new Date().toISOString(),
      );
      await this.apps.update(app.id, { status: AppStatus.Failed });
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  private detectType(projectDir: string): AppType {
    return fs.existsSync(path.join(projectDir, 'Dockerfile')) ? AppType.Container : AppType.Static;
  }

  private async findOrCreateApp(
    owner: UserRow,
    appName: string,
    type: AppType,
    description?: string,
    env?: Record<string, string>,
  ): Promise<AppRow> {
    const existing = await this.apps.findByOwnerAndName(owner.id, appName);
    if (existing) {
      this.assertTypeMatches(existing, type, appName);
      // Env from a deploy is only seeded on first creation; an existing app keeps
      // whatever env was set via the dashboard / `arcturus env`.
      return existing;
    }
    return this.apps.create({
      userId: owner.id,
      name: appName,
      description: description?.trim().slice(0, 200) || null,
      type,
      // Container apps default to the dedicated-port redirect: path-prefix
      // proxying breaks apps that reference assets by absolute path.
      routeMode: type === AppType.Container ? RouteMode.Redirect : RouteMode.Proxy,
      assignedPort: null,
      env: this.encryptInitialEnv(type, env),
    });
  }

  /** A redeploy must match the existing app's type — switching type needs an explicit delete first. */
  private assertTypeMatches(existing: AppRow, type: AppType, appName: string): void {
    if (existing.type !== type) {
      throw new LocalizedBadRequest('deployments.appTypeConflict', {
        name: appName,
        existing: existing.type,
        type,
      });
    }
  }

  /** Validates + encrypts deploy-supplied env for a brand-new container app. */
  private encryptInitialEnv(
    type: AppType,
    env: Record<string, string> | undefined,
  ): string | undefined {
    if (type !== AppType.Container || !env || Object.keys(env).length === 0) return undefined;
    assertValidEnv(env);
    return this.envCrypto.encrypt(JSON.stringify(env));
  }

  private async requireVisibleApp(appId: string, requester: UserRow): Promise<AppRow> {
    return this.appsService.assertManageRow(appId, requester);
  }

  private toSummary(deployment: DeploymentRow, app: AppRow): DeploymentSummary {
    return {
      id: deployment.id,
      appId: app.id,
      appName: app.name,
      status: deployment.status,
      finishedAt: deployment.finishedAt,
      createdAt: deployment.createdAt,
      active: deployment.id === app.activeDeploymentId,
      // History entries get a real answer from AppsService.listDeployments;
      // for create/poll responses the artifact is by definition still present.
      rollbackable: false,
    };
  }
}
