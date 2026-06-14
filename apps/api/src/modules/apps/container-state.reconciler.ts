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

    await this.sweepOrphans(rows);
  }

  /**
   * Removes platform-managed containers whose owning app row no longer exists.
   * Account/app deletion cleans up containers best-effort; a transient Docker
   * error there leaves the row gone but the container running forever (its
   * RestartPolicy survives reboots). Labels created before this feature shipped
   * have no app-id and are left alone (grandfathered until their next redeploy).
   */
  private async sweepOrphans(rows: { id: string }[]): Promise<void> {
    const liveAppIds = new Set(rows.map((app) => app.id));
    let managed: { id: string; appId: string | null }[];
    try {
      managed = await this.runtime.listManaged();
    } catch (error) {
      this.logger.warn(
        `Could not list managed containers for orphan sweep: ${error instanceof Error ? error.message : error}`,
      );
      return;
    }

    for (const container of managed) {
      if (!container.appId || liveAppIds.has(container.appId)) continue;
      try {
        await this.runtime.removeContainer(container.id);
        this.logger.log(
          `Swept orphan container ${container.id} (app ${container.appId} no longer exists)`,
        );
      } catch (error) {
        this.logger.warn(
          `Could not sweep orphan container ${container.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
