import type {
  AppSharing,
  AppSummary,
  DeploymentSummary,
  PortCheckRequest,
  PortCheckResponse,
  RollbackRequest,
  SetPortRequest,
  ShareableUser,
  UpdateAppRequest,
  UpdateAppSharingRequest,
} from '@arcturus/shared';
import { RouteMode } from '@arcturus/shared';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { LocalizedBadRequest } from '../../common/i18n/localized.exception';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AppsService } from './apps.service';

@Controller('api/apps')
@UseGuards(AuthGuard)
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  @Get()
  list(@CurrentUser() user: UserRow): Promise<AppSummary[]> {
    return this.apps.listFor(user);
  }

  @Get('shareable-users')
  listShareableUsers(@CurrentUser() user: UserRow): Promise<ShareableUser[]> {
    return this.apps.listShareableUsers(user);
  }

  @Get(':id')
  get(@CurrentUser() user: UserRow, @Param('id') id: string): Promise<AppSummary> {
    return this.apps.getFor(id, user);
  }

  @Get(':id/deployments')
  listDeployments(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
  ): Promise<DeploymentSummary[]> {
    return this.apps.listDeployments(id, user);
  }

  @Get(':id/sharing')
  getSharing(@CurrentUser() user: UserRow, @Param('id') id: string): Promise<AppSharing> {
    return this.apps.getSharing(id, user);
  }

  @Put(':id/sharing')
  async updateSharing(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
    @Body() body: UpdateAppSharingRequest,
  ): Promise<{ ok: true }> {
    if (body.sharedAll !== null && body.sharedAll !== undefined) {
      if (body.sharedAll !== 'view' && body.sharedAll !== 'manage') {
        throw new LocalizedBadRequest('apps.unknownShareRole');
      }
    }
    if (!Array.isArray(body.shares)) {
      body = { ...body, shares: [] };
    }
    await this.apps.updateSharing(id, user, {
      sharedAll: body.sharedAll ?? null,
      shares: (body.shares ?? []).map((s: { userId: string; role: string }) => ({
        userId: s.userId,
        role: s.role as 'view' | 'manage',
      })),
    });
    return { ok: true };
  }

  @Post(':id/rollback')
  async rollback(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
    @Body() body: RollbackRequest,
  ): Promise<{ ok: true }> {
    if (!body.deploymentId) throw new LocalizedBadRequest('apps.deploymentIdRequired');
    await this.apps.rollback(id, user, body.deploymentId);
    return { ok: true };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
    @Body() body: UpdateAppRequest,
  ): Promise<{ ok: true }> {
    if (body.routeMode !== undefined) {
      if (body.routeMode !== RouteMode.Proxy && body.routeMode !== RouteMode.Redirect) {
        throw new LocalizedBadRequest('apps.unknownRouteMode', { mode: body.routeMode });
      }
      await this.apps.updateRouteMode(id, user, body.routeMode);
    }
    if (body.env !== undefined) {
      if (typeof body.env !== 'object' || body.env === null || Array.isArray(body.env)) {
        throw new LocalizedBadRequest('apps.envMustBeObject');
      }
      await this.apps.updateEnv(id, user, body.env);
    }
    if (body.description !== undefined) {
      if (typeof body.description !== 'string') {
        throw new LocalizedBadRequest('apps.descriptionMustBeString');
      }
      await this.apps.updateDescription(id, user, body.description);
    }
    if (body.memoryLimitMb !== undefined) {
      if (typeof body.memoryLimitMb !== 'number' || !Number.isInteger(body.memoryLimitMb)) {
        throw new LocalizedBadRequest('apps.memoryLimitMbInteger');
      }
      await this.apps.updateMemoryLimit(id, user, body.memoryLimitMb);
    }
    return { ok: true };
  }

  @Post(':id/port/check')
  async checkPort(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
    @Body() body: PortCheckRequest,
  ): Promise<PortCheckResponse> {
    if (typeof body.port !== 'number' || !Number.isInteger(body.port)) {
      throw new LocalizedBadRequest('apps.portInteger');
    }
    return this.apps.checkPort(id, user, body.port);
  }

  @Put(':id/port')
  async setPort(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
    @Body() body: SetPortRequest,
  ): Promise<{ ok: true }> {
    if (body.port !== null && (typeof body.port !== 'number' || !Number.isInteger(body.port))) {
      throw new LocalizedBadRequest('apps.portInteger');
    }
    await this.apps.updateAssignedPort(id, user, body.port);
    return { ok: true };
  }

  @Post(':id/stop')
  async stop(@CurrentUser() user: UserRow, @Param('id') id: string): Promise<{ ok: true }> {
    await this.apps.stop(id, user);
    return { ok: true };
  }

  @Post(':id/restart')
  async restart(@CurrentUser() user: UserRow, @Param('id') id: string): Promise<{ ok: true }> {
    await this.apps.restart(id, user);
    return { ok: true };
  }

  @Delete(':id')
  async delete(@CurrentUser() user: UserRow, @Param('id') id: string): Promise<{ ok: true }> {
    await this.apps.delete(id, user);
    return { ok: true };
  }
}
