import fs from 'node:fs';
import path from 'node:path';
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfig } from '../../common/config/app-config';
import { LocalizedNotFound } from '../../common/i18n/localized.exception';
import { renderInstallScript } from './install-script';

const BINARY_PATTERN = /^arcturus-(darwin|linux)-(arm64|x64)$/;

/**
 * Serves the curl-installable CLI:
 *   curl -fsSL http://<host>:7777/install.sh | sh
 * The script detects the platform and downloads /cli/arcturus-<os>-<arch>.
 * Binaries come from `bun run build:all` in apps/cli (or ARCTURUS_CLI_DIST).
 */
@Controller()
export class CliDistController {
  constructor(private readonly config: AppConfig) {}

  @Get('install.sh')
  installScript(@Req() req: Request, @Res() res: Response): void {
    // The URL the script was fetched from is the server every command targets.
    const serverUrl = `${req.protocol}://${req.get('host') ?? `127.0.0.1:${this.config.gatewayPort}`}`;
    res.type('text/x-shellscript').send(renderInstallScript(serverUrl));
  }

  @Get('cli/:binary')
  binary(@Param('binary') binary: string, @Res() res: Response): void {
    if (!BINARY_PATTERN.test(binary)) throw new LocalizedNotFound('cliDist.unknownBinary');

    const file = path.join(this.config.cliDistDir, binary);
    if (!fs.existsSync(file)) {
      throw new LocalizedNotFound('cliDist.binaryNotBuilt');
    }
    res.type('application/octet-stream');
    res.sendFile(file);
  }
}
