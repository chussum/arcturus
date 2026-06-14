import path from 'node:path';
import type { DeploymentDetail, DeploymentSummary } from '@arcturus/shared';
import { AppType } from '@arcturus/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { nanoid } from 'nanoid';
import { AppConfig } from '../../common/config/app-config';
import { LocalizedBadRequest } from '../../common/i18n/localized.exception';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DeploymentsService } from './deployments.service';

const config = new AppConfig();

interface CreateDeploymentBody {
  appName?: string;
  /** Owner username for a cross-account deploy to a shared app (manage+); omit for your own account. */
  owner?: string;
  type?: string;
  description?: string;
  /** JSON-encoded Record<string,string>; applied as env on first creation of a container app. */
  env?: string;
}

@Controller('api/deployments')
@UseGuards(AuthGuard)
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  // Deploys get their own budget (builds are CPU/disk-heavy but 10/min is too
  // tight for bursts) — a per-route override of the global throttler config.
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('archive', {
      storage: diskStorage({
        destination: path.join(config.buildsDir, 'uploads'),
        filename: (_req, _file, done) => done(null, `${nanoid()}.zip`),
      }),
      limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
    }),
  )
  create(
    @CurrentUser() user: UserRow,
    @UploadedFile() archive: Express.Multer.File | undefined,
    @Body() body: CreateDeploymentBody,
  ): Promise<DeploymentSummary> {
    if (!archive) throw new LocalizedBadRequest('deployments.archiveFieldRequired');
    return this.deployments.create(user, body.appName ?? '', archive.path, {
      ownerUsername: body.owner,
      explicitType: parseAppType(body.type),
      description: body.description,
      originalName: archive.originalname,
      env: parseEnvField(body.env),
    });
  }

  @Get(':id')
  getDetail(@CurrentUser() user: UserRow, @Param('id') id: string): Promise<DeploymentDetail> {
    return this.deployments.getDetail(id, user);
  }
}

function parseAppType(raw: string | undefined): AppType | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (raw === AppType.Static || raw === AppType.Container) return raw;
  throw new LocalizedBadRequest('deployments.unknownAppType', { raw });
}

/** Decodes the multipart `env` field (a JSON object) into a string map, or undefined when absent. */
function parseEnvField(raw: string | undefined): Record<string, string> | undefined {
  if (raw === undefined || raw === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LocalizedBadRequest('deployments.envInvalidJson');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LocalizedBadRequest('deployments.envInvalidJson');
  }
  return parsed as Record<string, string>;
}
