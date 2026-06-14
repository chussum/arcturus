import { AppStatus, AppType } from '@arcturus/shared';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ContainerRuntime } from '../../infrastructure/container-runtime/container-runtime.port';
import { AppsRepository } from '../../infrastructure/persistence/repositories/apps.repository.port';

/**
 * The platform process can restart independently of Docker (deploys, crashes,
 * server reboots). On boot, bring the DB view of each container app back in
 * line with what Docker actually reports.
 */
@Injectable()
export class ContainerStateReconciler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContainerStateReconciler.name);

  constructor(
    private readonly apps: AppsRepository,
    private readonly runtime: ContainerRuntime,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const rows = await this.apps.list();
    for (const app of rows) {
      if (app.type !== AppType.Container || !app.containerId) continue;

      try {
        const state = await this.runtime.getState(app.containerId);
        const status =
          state === 'running'
            ? AppStatus.Running
            : state === 'stopped'
              ? AppStatus.Stopped
              : AppStatus.Failed;
        if (status !== app.status) {
          await this.apps.update(app.id, { status });
          this.logger.log(`Reconciled ${app.name}: ${app.status} → ${status}`);
        }
      } catch (error) {
        this.logger.warn(
          `Could not reconcile ${app.name}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
