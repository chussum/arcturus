import { AppType, DeploymentStatus } from '@arcturus/shared';
import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LocalizedBadRequest } from '../../common/i18n/localized.exception';
import { ContainerRuntime } from '../../infrastructure/container-runtime/container-runtime.port';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { AppsService } from '../apps/apps.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DeploymentsService } from '../deployments/deployments.service';

const BUILD_LOG_POLL_MS = 500;

@Controller('api')
@UseGuards(AuthGuard)
export class LogsController {
  constructor(
    private readonly apps: AppsService,
    private readonly deployments: DeploymentsService,
    private readonly runtime: ContainerRuntime,
  ) {}

  /** Live container stdout/stderr as server-sent events. */
  @Get('apps/:id/logs')
  async streamAppLogs(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const app = await this.apps.findRowFor(id, user);
    if (app.type !== AppType.Container || !app.containerId) {
      throw new LocalizedBadRequest('logs.containerOnly');
    }

    openSse(res);
    const unsubscribe = await this.runtime.streamLogs(
      app.containerId,
      (line) => {
        res.write(`data: ${JSON.stringify(line)}\n\n`);
      },
      // Container stopped — tell the client explicitly so it can show it
      // instead of silently idling (or auto-reconnecting in a loop).
      () => {
        res.write(`event: end\ndata: ""\n\n`);
        res.end();
      },
    );
    req.on('close', unsubscribe);
  }

  /** Build log as server-sent events; replays what exists, then follows until the build ends. */
  @Get('deployments/:id/build-log')
  async streamBuildLog(
    @CurrentUser() user: UserRow,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Authorizes up front: getDetail throws if the deployment isn't visible.
    await this.deployments.getDetail(id, user);

    openSse(res);
    let offset = 0;
    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    while (!closed) {
      const detail = await this.deployments.getDetail(id, user);
      const fresh = detail.buildLog.slice(offset);
      offset = detail.buildLog.length;
      for (const line of fresh.split('\n').filter(Boolean)) {
        res.write(`data: ${JSON.stringify(line)}\n\n`);
      }

      const finished =
        detail.status === DeploymentStatus.Running || detail.status === DeploymentStatus.Failed;
      if (finished) {
        res.write(`event: done\ndata: ${JSON.stringify(detail.status)}\n\n`);
        res.end();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, BUILD_LOG_POLL_MS));
    }
  }
}

function openSse(res: Response): void {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
}
