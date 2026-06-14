import { AppStatus, AppType } from '@arcturus/shared';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../common/config/app-config';
import { ContainerRuntime } from '../../../infrastructure/container-runtime/container-runtime.port';
import { EnvCryptoService } from '../../../infrastructure/crypto/env-crypto.service';
import { AppsRepository } from '../../../infrastructure/persistence/repositories/apps.repository.port';
import { DeploymentsRepository } from '../../../infrastructure/persistence/repositories/deployments.repository.port';
import { buildContainerEnv, parseEnvColumn } from '../../apps/container-env';
import { PortAllocatorService } from '../port-allocator.service';
import { type DeployContext, DeployStrategy } from './deploy-strategy';

/** Apps are told where to listen through this env var (fly.io convention). */
export const CONTAINER_PORT = 8080;

export function containerNameFor(username: string, appName: string): string {
  return `arcturus--${username}--${appName}`;
}

/** Each deployment gets its own image tag, so rollback can re-run any kept release. */
export function imageTagFor(username: string, appName: string, deploymentId: string): string {
  return `arcturus/${username}--${appName}:${deploymentId}`;
}

/**
 * Docker phrases a host-port collision differently per platform/runtime
 * ("port is already allocated" on Linux, "ports are not available" /
 * "address already in use" via Docker Desktop & OrbStack on macOS).
 */
export function isPortConflictError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('port is already allocated') ||
    message.includes('address already in use') ||
    message.includes('ports are not available')
  );
}

@Injectable()
export class ContainerDeployStrategy extends DeployStrategy {
  readonly type = AppType.Container;

  constructor(
    private readonly runtime: ContainerRuntime,
    private readonly apps: AppsRepository,
    private readonly deployments: DeploymentsRepository,
    private readonly ports: PortAllocatorService,
    private readonly config: AppConfig,
    private readonly envCrypto: EnvCryptoService,
  ) {
    super();
  }

  async deploy(context: DeployContext): Promise<void> {
    const { app, owner, deploymentId, projectDir, log } = context;

    let hostPort = app.assignedPort ?? (await this.ports.allocate());
    if (app.assignedPort === null) {
      await this.apps.update(app.id, { assignedPort: hostPort });
      await log(`Assigned dedicated port ${hostPort}`);
    }

    const memoryBytes = (app.memoryLimitMb ?? this.config.defaultMemoryMb) * 1024 * 1024;
    const user = this.config.containerUser || undefined;

    const imageTag = imageTagFor(owner.username, app.name, deploymentId);
    await log(`Building image ${imageTag}...`);
    await this.runtime.buildImage(projectDir, imageTag, (line) => void log(line), { memoryBytes });

    await log('Starting container...');
    const runOptions = {
      name: containerNameFor(owner.username, app.name),
      appId: app.id,
      imageTag,
      containerPort: CONTAINER_PORT,
      memoryBytes,
      user,
      env: buildContainerEnv(parseEnvColumn(this.envCrypto.decrypt(app.env)), {
        port: CONTAINER_PORT,
        appRef: `${owner.username}/${app.name}`,
      }),
    };

    let containerId: string;
    try {
      containerId = await this.runtime.runContainer({ ...runOptions, hostPort });
    } catch (error) {
      // The sticky port can be stolen while we're not holding it — typically
      // by another Arcturus instance under a different OS account on the same
      // machine. Re-allocate once; the dedicated URL changes but the deploy
      // succeeds. (No pre-probe: during a redeploy our own outgoing container
      // legitimately holds the port until runContainer replaces it.)
      if (!isPortConflictError(error)) throw error;
      const previousPort = hostPort;
      hostPort = await this.ports.allocate();
      await this.apps.update(app.id, { assignedPort: hostPort });
      await log(
        `Port ${previousPort} is taken by another process; reassigned dedicated port to ${hostPort}`,
      );
      containerId = await this.runtime.runContainer({ ...runOptions, hostPort });
    }

    await this.apps.update(app.id, {
      status: AppStatus.Running,
      containerId,
      activeDeploymentId: deploymentId,
      lastDeployedAt: new Date().toISOString(),
    });

    await this.pruneOldImages(context);
    await log(
      `Live at http://<host>:${this.config.appsPort}/${owner.username}/${app.name}/ and http://<host>:${hostPort}/`,
    );
  }

  /** Keeps images for the most recent successful deployments, removes the rest. */
  private async pruneOldImages(context: DeployContext): Promise<void> {
    const { app, owner, deploymentId, log } = context;
    const history = await this.deployments.listByApp(app.id);

    const keep = new Set(
      [deploymentId, ...history.filter((d) => d.status === 'running').map((d) => d.id)].slice(
        0,
        this.config.keepReleases,
      ),
    );

    for (const deployment of history) {
      if (keep.has(deployment.id)) continue;
      const tag = imageTagFor(owner.username, app.name, deployment.id);
      if (await this.runtime.imageExists(tag)) {
        await this.runtime.removeImage(tag);
        await log(`Pruned old release image ${tag}`);
      }
    }
  }
}
