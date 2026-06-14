import type { Command } from 'commander';
import { ApiClient } from '../lib/api-client';
import { loadCliConfig } from '../lib/config';
import { findAppByName } from './shared';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs <appName>')
    .description('Follow live logs of a container app (Ctrl-C to stop)')
    .action(async (appName: string) => {
      const client = new ApiClient(loadCliConfig());
      const app = await findAppByName(client, appName);
      await client.streamSse(`/api/apps/${app.id}/logs`, (line) => console.log(line));
    });
}
