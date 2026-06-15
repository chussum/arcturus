import type {
  AppSharing,
  AppSummary,
  DeploymentSummary,
  PortCheckResponse,
  RouteMode,
  ShareableUser,
  UpdateAppSharingRequest,
} from '@arcturus/shared';
import { AppStatus, AppType, DeploymentStatus, ShareRole, UserRole } from '@arcturus/shared';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../common/config/app-config';
import { LocalizedBadRequest, LocalizedNotFound } from '../../common/i18n/localized.exception';
import { ContainerRuntime } from '../../infrastructure/container-runtime/container-runtime.port';
import { EnvCryptoService } from '../../infrastructure/crypto/env-crypto.service';
import type { AppRow, UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { AppSharesRepository } from '../../infrastructure/persistence/repositories/app-shares.repository.port';
import { AppsRepository } from '../../infrastructure/persistence/repositories/apps.repository.port';
import { DeploymentsRepository } from '../../infrastructure/persistence/repositories/deployments.repository.port';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';
import { StaticSitesService } from '../../infrastructure/storage/static-sites.service';
import {
  CONTAINER_PORT,
  containerNameFor,
  imageTagFor,
} from '../deployments/pipeline/container-deploy.strategy';
import { PortAllocatorService } from '../deployments/port-allocator.service';
import { assertValidEnv, buildContainerEnv, parseEnvColumn } from './container-env';

type ViewerRole = 'owner' | 'admin' | 'manage' | 'view';

/** Maps a port-unavailability reason to its localized error key. */
const PORT_REASON_KEYS = {
  outOfRange: 'apps.portOutOfRange',
  reserved: 'apps.portReserved',
  taken: 'apps.portTaken',
} as const;

// Priority order for deduplication: higher index wins.
const ROLE_PRIORITY: ViewerRole[] = ['view', 'manage', 'owner', 'admin'];

function higherRole(a: ViewerRole, b: ViewerRole): ViewerRole {
  return ROLE_PRIORITY.indexOf(a) >= ROLE_PRIORITY.indexOf(b) ? a : b;
}

@Injectable()
export class AppsService {
  constructor(
    private readonly apps: AppsRepository,
    private readonly appShares: AppSharesRepository,
    private readonly users: UsersRepository,
    private readonly deployments: DeploymentsRepository,
    private readonly staticSites: StaticSitesService,
    private readonly runtime: ContainerRuntime,
    private readonly envCrypto: EnvCryptoService,
    private readonly config: AppConfig,
    private readonly ports: PortAllocatorService,
  ) {}

  private readonly logger = new Logger(AppsService.name);

  /** Members see own apps + apps shared with them or with everyone. Admins see all. */
  async listFor(requester: UserRow): Promise<AppSummary[]> {
    const usernameById = new Map((await this.users.list()).map((u) => [u.id, u.username]));

    if (requester.role === UserRole.Admin) {
      const rows = await this.apps.list();
      return rows.map((row) =>
        this.toSummary(row, usernameById.get(row.userId) ?? row.userId, 'admin'),
      );
    }

    // Collect all candidate apps with their effective viewer role.
    const byId = new Map<string, { app: AppRow; role: ViewerRole }>();

    // Own apps.
    for (const app of await this.apps.listByUser(requester.id)) {
      byId.set(app.id, { app, role: 'owner' });
    }

    // Apps shared with everyone.
    for (const app of await this.apps.listSharedWithEveryone()) {
      if (app.userId === requester.id) continue; // already owner
      const role = app.sharedAllRole as ShareRole;
      const existing = byId.get(app.id);
      byId.set(app.id, { app, role: existing ? higherRole(existing.role, role) : role });
    }

    // Apps shared specifically with this user.
    const myShares = await this.appShares.listByUser(requester.id);
    if (myShares.length > 0) {
      const sharedApps = await this.apps.listByIds(myShares.map((s) => s.appId));
      const roleByAppId = new Map(myShares.map((s) => [s.appId, s.role as ShareRole]));
      for (const app of sharedApps) {
        if (app.userId === requester.id) continue;
        const role = roleByAppId.get(app.id) ?? ShareRole.View;
        const existing = byId.get(app.id);
        byId.set(app.id, { app, role: existing ? higherRole(existing.role, role) : role });
      }
    }

    return Array.from(byId.values()).map(({ app, role }) =>
      this.toSummary(app, usernameById.get(app.userId) ?? app.userId, role),
    );
  }

  async getFor(id: string, requester: UserRow): Promise<AppSummary> {
    const { app, role } = await this.requireView(id, requester);
    const owner = await this.users.findById(app.userId);
    const summary = this.toSummary(app, owner?.username ?? app.userId, role);
    // Strip secrets from view-only users.
    if (role === 'view') return { ...summary, env: {} };
    return summary;
  }

  /** Deployment history, newest first. */
  async listDeployments(id: string, requester: UserRow): Promise<DeploymentSummary[]> {
    const { app } = await this.requireView(id, requester);
    const owner = await this.requireOwner(app);
    const history = await this.deployments.listByApp(app.id);

    return Promise.all(
      history.map(async (deployment) => ({
        id: deployment.id,
        appId: app.id,
        appName: app.name,
        status: deployment.status,
        finishedAt: deployment.finishedAt,
        createdAt: deployment.createdAt,
        active: deployment.id === app.activeDeploymentId,
        rollbackable:
          deployment.status === DeploymentStatus.Running &&
          deployment.id !== app.activeDeploymentId &&
          (await this.artifactExists(app, owner.username, deployment.id)),
      })),
    );
  }

  async rollback(id: string, requester: UserRow, deploymentId: string): Promise<void> {
    const { app } = await this.requireManage(id, requester);
    const owner = await this.requireOwner(app);

    const deployment = await this.deployments.findById(deploymentId);
    if (!deployment || deployment.appId !== app.id) {
      throw new LocalizedNotFound('apps.deploymentNotFound');
    }
    if (deployment.status !== DeploymentStatus.Running) {
      throw new LocalizedBadRequest('apps.onlySuccessfulRollback');
    }
    if (!(await this.artifactExists(app, owner.username, deploymentId))) {
      throw new LocalizedBadRequest('apps.releasePruned');
    }

    if (app.type === AppType.Container) {
      await this.recreateContainer(app, owner.username, deploymentId);
    }
    await this.apps.update(app.id, { activeDeploymentId: deploymentId });
  }

  async updateEnv(id: string, requester: UserRow, env: Record<string, string>): Promise<void> {
    const { app } = await this.requireManage(id, requester);
    if (app.type !== AppType.Container) {
      throw new LocalizedBadRequest('apps.envContainerOnly');
    }
    assertValidEnv(env);
    const encrypted = this.envCrypto.encrypt(JSON.stringify(env));
    await this.apps.update(app.id, { env: encrypted });

    if (app.activeDeploymentId && app.containerId) {
      const owner = await this.requireOwner(app);
      const updated = { ...app, env: encrypted };
      await this.recreateContainer(updated, owner.username, app.activeDeploymentId);
    }
  }

  async updateRouteMode(id: string, requester: UserRow, routeMode: RouteMode): Promise<void> {
    await this.requireManage(id, requester);
    await this.apps.update(id, { routeMode });
  }

  async updateMemoryLimit(id: string, requester: UserRow, memoryLimitMb: number): Promise<void> {
    const { app } = await this.requireManage(id, requester);
    if (app.type !== AppType.Container) {
      throw new LocalizedBadRequest('apps.memoryContainerOnly');
    }
    if (!Number.isInteger(memoryLimitMb) || memoryLimitMb < 1) {
      throw new LocalizedBadRequest('apps.memoryPositive');
    }
    if (memoryLimitMb > this.config.maxMemoryMb) {
      throw new LocalizedBadRequest('apps.memoryExceedsMax', { max: this.config.maxMemoryMb });
    }
    await this.apps.update(app.id, { memoryLimitMb });

    if (app.activeDeploymentId && app.containerId) {
      const owner = await this.requireOwner(app);
      await this.recreateContainer(
        { ...app, memoryLimitMb },
        owner.username,
        app.activeDeploymentId,
      );
    }
  }

  /** Checks whether a user-entered host port can be assigned to this container app. */
  async checkPort(id: string, requester: UserRow, port: number): Promise<PortCheckResponse> {
    const { app } = await this.requireManage(id, requester);
    if (app.type !== AppType.Container) {
      throw new LocalizedBadRequest('apps.portContainerOnly');
    }
    return this.ports.validateManualPort(port, app.assignedPort);
  }

  /**
   * Sets the container app's dedicated host port. A number assigns that exact port
   * (re-validated server-side — never trust the client's earlier check); null releases
   * the manual port and auto-allocates a fresh one from the pool. A running container
   * is recreated to bind the new port.
   */
  async updateAssignedPort(id: string, requester: UserRow, port: number | null): Promise<void> {
    const { app } = await this.requireManage(id, requester);
    if (app.type !== AppType.Container) {
      throw new LocalizedBadRequest('apps.portContainerOnly');
    }

    let newPort: number;
    if (port === null) {
      newPort = await this.ports.allocate();
    } else {
      const result = await this.ports.validateManualPort(port, app.assignedPort);
      if (!result.available) {
        throw new LocalizedBadRequest(PORT_REASON_KEYS[result.reason ?? 'taken']);
      }
      newPort = port;
    }

    if (newPort === app.assignedPort) return;
    await this.apps.update(app.id, { assignedPort: newPort });

    // Recreate to rebind the port. runContainer removes the old container (freeing the
    // old port) before binding the new one. If the new port is stolen in the race window
    // this throws (no auto-reassign — a manual port is deliberate) and the app is left
    // not-running; the caller surfaces the error and the user retries.
    if (app.activeDeploymentId && app.containerId) {
      const owner = await this.requireOwner(app);
      await this.recreateContainer(
        { ...app, assignedPort: newPort },
        owner.username,
        app.activeDeploymentId,
      );
    }
  }

  async updateDescription(id: string, requester: UserRow, description: string): Promise<void> {
    await this.requireManage(id, requester);
    const trimmed = description.trim().slice(0, 200);
    await this.apps.update(id, { description: trimmed || null });
  }

  async stop(id: string, requester: UserRow): Promise<void> {
    const { app } = await this.requireRunnable(id, requester);
    await this.runtime.stopContainer(app.containerId ?? '');
    await this.apps.update(id, { status: AppStatus.Stopped });
  }

  async restart(id: string, requester: UserRow): Promise<void> {
    const { app } = await this.requireRunnable(id, requester);
    const containerId = app.containerId ?? '';
    await this.runtime.stopContainer(containerId);
    await this.runtime.startContainer(containerId);
    await this.apps.update(id, { status: AppStatus.Running });
  }

  async delete(id: string, requester: UserRow): Promise<void> {
    const { app } = await this.requireOwnerOrAdmin(id, requester);
    const owner = await this.users.findById(app.userId);
    if (owner) await this.cleanupAppResources(app, owner.username);
    await this.apps.delete(id);
  }

  /** Removes an app's real resources (static files, container, images). DB rows are
   *  handled by the caller (direct delete or the user-delete cascade). */
  private async cleanupAppResources(app: AppRow, ownerUsername: string): Promise<void> {
    if (app.type === AppType.Static) {
      this.staticSites.remove(ownerUsername, app.name);
    }
    if (app.type === AppType.Container && app.containerId) {
      await this.runtime.removeContainer(app.containerId);
      for (const deployment of await this.deployments.listByApp(app.id)) {
        await this.runtime.removeImage(imageTagFor(ownerUsername, app.name, deployment.id));
      }
    }
  }

  /** Called just before deleting an account: cleans up every app's container/image/
   *  static files. DB rows are removed by the user-delete cascade, so this only
   *  touches real resources. Best-effort per app — one failure won't block the
   *  account deletion or the remaining apps' cleanup. */
  async purgeResourcesForUser(userId: string, username: string): Promise<void> {
    for (const app of await this.apps.listByUser(userId)) {
      try {
        await this.cleanupAppResources(app, username);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to clean up resources for app ${app.id}: ${message}`);
      }
    }
    // Drop the user's whole static tree, including the now-empty parent dir and
    // any legacy flat-layout sites the per-app cleanup above didn't cover.
    try {
      this.staticSites.removeUser(username);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to remove static dir for user ${username}: ${message}`);
    }
  }

  /** Returns the app sharing configuration (sharedAll + per-user grants). Owner/admin only. */
  async getSharing(id: string, requester: UserRow): Promise<AppSharing> {
    const { app } = await this.requireOwnerOrAdmin(id, requester);
    const shares = await this.appShares.listByApp(app.id);
    const entries = await Promise.all(
      shares.map(async (share) => {
        const user = await this.users.findById(share.userId);
        return {
          userId: share.userId,
          username: user?.username ?? share.userId,
          role: share.role as ShareRole,
        };
      }),
    );
    return {
      sharedAll: app.sharedAllRole as ShareRole | null,
      shares: entries,
    };
  }

  /** Replaces the app's sharing config. Owner/admin only. */
  async updateSharing(id: string, requester: UserRow, req: UpdateAppSharingRequest): Promise<void> {
    const { app } = await this.requireOwnerOrAdmin(id, requester);

    // Validate sharedAll.
    if (
      req.sharedAll !== null &&
      req.sharedAll !== ShareRole.View &&
      req.sharedAll !== ShareRole.Manage
    ) {
      throw new LocalizedBadRequest('apps.unknownShareRole');
    }

    // Validate per-user shares.
    if (req.shares.length > 50) {
      throw new LocalizedBadRequest('apps.tooManyShares');
    }

    for (const share of req.shares) {
      if (share.role !== ShareRole.View && share.role !== ShareRole.Manage) {
        throw new LocalizedBadRequest('apps.unknownShareRole');
      }
      const user = await this.users.findById(share.userId);
      if (!user) throw new LocalizedBadRequest('apps.shareUserNotFound');
      if (share.userId === app.userId) {
        throw new LocalizedBadRequest('apps.cannotShareWithSelf');
      }
    }

    await this.apps.update(id, { sharedAllRole: req.sharedAll });
    await this.appShares.replaceForApp(id, req.shares);
  }

  /** All users except the requester — for the "add user" dropdown in the sharing UI. */
  async listShareableUsers(requester: UserRow): Promise<ShareableUser[]> {
    const all = await this.users.list();
    return all
      .filter((u) => u.id !== requester.id)
      .map((u) => ({ id: u.id, username: u.username }));
  }

  /** Manage-gated row access — used by logs controller and deployments service. */
  async assertManageRow(id: string, requester: UserRow): Promise<AppRow> {
    const { app } = await this.requireManage(id, requester);
    return app;
  }

  /** Ownership-checked raw row access (manage-gated) for modules that need more than the summary. */
  async findRowFor(id: string, requester: UserRow): Promise<AppRow> {
    return this.assertManageRow(id, requester);
  }

  /**
   * Resolves a shared app by (ownerUsername, name) and asserts the requester has manage+.
   * Used by cross-account deploy: returns the existing app and its real owner so the deploy
   * pipeline can key artifacts by the owner's username. Throws if the owner or app is missing,
   * or `apps.notFound` if the requester lacks manage access (denial == not-found, privacy model).
   */
  async resolveManagedAppByRef(
    ownerUsername: string,
    name: string,
    requester: UserRow,
  ): Promise<{ app: AppRow; owner: UserRow }> {
    const owner = await this.users.findByUsername(ownerUsername);
    if (!owner) throw new LocalizedNotFound('deployments.ownerNotFound', { owner: ownerUsername });
    const app = await this.apps.findByOwnerAndName(owner.id, name);
    if (!app) {
      throw new LocalizedNotFound('deployments.crossAccountAppNotFound', {
        owner: ownerUsername,
        name,
      });
    }
    await this.assertManageRow(app.id, requester);
    return { app, owner };
  }

  private async recreateContainer(
    app: AppRow,
    ownerUsername: string,
    deploymentId: string,
  ): Promise<void> {
    if (app.assignedPort === null) {
      throw new LocalizedBadRequest('apps.noAssignedPort');
    }
    const containerId = await this.runtime.runContainer({
      name: containerNameFor(ownerUsername, app.name),
      appId: app.id,
      imageTag: imageTagFor(ownerUsername, app.name, deploymentId),
      hostPort: app.assignedPort,
      containerPort: CONTAINER_PORT,
      memoryBytes: (app.memoryLimitMb ?? this.config.defaultMemoryMb) * 1024 * 1024,
      user: this.config.containerUser || undefined,
      env: buildContainerEnv(parseEnvColumn(this.envCrypto.decrypt(app.env)), {
        port: CONTAINER_PORT,
        appRef: `${ownerUsername}/${app.name}`,
      }),
    });
    await this.apps.update(app.id, { containerId, status: AppStatus.Running });
  }

  private async artifactExists(
    app: AppRow,
    ownerUsername: string,
    deploymentId: string,
  ): Promise<boolean> {
    if (app.type === AppType.Static) {
      return this.staticSites.hasRelease(ownerUsername, app.name, deploymentId);
    }
    return this.runtime.imageExists(imageTagFor(ownerUsername, app.name, deploymentId));
  }

  private async requireOwner(app: AppRow): Promise<UserRow> {
    const owner = await this.users.findById(app.userId);
    if (!owner) throw new LocalizedNotFound('apps.ownerGone');
    return owner;
  }

  private async requireRunnable(
    id: string,
    requester: UserRow,
  ): Promise<{ app: AppRow; role: ViewerRole }> {
    const result = await this.requireManage(id, requester);
    if (result.app.type !== AppType.Container || !result.app.containerId) {
      throw new LocalizedBadRequest('apps.onlyContainerStopRestart');
    }
    return result;
  }

  /** Resolves the requester's effective access level for an app. Returns null if no access. */
  private async resolveAccess(
    id: string,
    requester: UserRow,
  ): Promise<{ app: AppRow; role: ViewerRole } | null> {
    const app = await this.apps.findById(id);
    if (!app) return null;

    if (requester.role === UserRole.Admin) return { app, role: 'admin' };
    if (app.userId === requester.id) return { app, role: 'owner' };

    // Effective role = max of individual share and everyone-share.
    let effective: ViewerRole | null = null;

    const individualShare = await this.appShares.findByAppAndUser(app.id, requester.id);
    if (individualShare) {
      effective = individualShare.role as ViewerRole;
    }

    if (app.sharedAllRole) {
      const everyoneRole = app.sharedAllRole as ViewerRole;
      effective = effective ? higherRole(effective, everyoneRole) : everyoneRole;
    }

    return effective ? { app, role: effective } : null;
  }

  private async requireView(
    id: string,
    requester: UserRow,
  ): Promise<{ app: AppRow; role: ViewerRole }> {
    const result = await this.resolveAccess(id, requester);
    if (!result) throw new LocalizedNotFound('apps.notFound');
    return result;
  }

  private async requireManage(
    id: string,
    requester: UserRow,
  ): Promise<{ app: AppRow; role: ViewerRole }> {
    const result = await this.resolveAccess(id, requester);
    if (!result) throw new LocalizedNotFound('apps.notFound');
    if (result.role === 'view') throw new LocalizedNotFound('apps.notFound');
    return result;
  }

  private async requireOwnerOrAdmin(
    id: string,
    requester: UserRow,
  ): Promise<{ app: AppRow; role: ViewerRole }> {
    const result = await this.resolveAccess(id, requester);
    if (!result) throw new LocalizedNotFound('apps.notFound');
    if (result.role !== 'owner' && result.role !== 'admin') {
      throw new LocalizedNotFound('apps.notFound');
    }
    return result;
  }

  private toSummary(row: AppRow, ownerUsername: string, viewerRole: ViewerRole): AppSummary {
    return {
      id: row.id,
      ownerUsername,
      name: row.name,
      description: row.description,
      type: row.type,
      status: row.status,
      routeMode: row.routeMode,
      assignedPort: row.assignedPort,
      path: `/${ownerUsername}/${row.name}`,
      activeDeploymentId: row.activeDeploymentId,
      env: parseEnvColumn(this.envCrypto.decrypt(row.env)),
      memoryLimitMb: row.memoryLimitMb,
      createdAt: row.createdAt,
      lastDeployedAt: row.lastDeployedAt,
      viewerRole,
    };
  }
}
