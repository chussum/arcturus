import type { Command } from 'commander';
import { ApiClient } from '../lib/api-client';
import { loadCliConfig } from '../lib/config';
import { findAppByName } from './shared';

export function registerDestroyCommand(program: Command): void {
  program
    .command('destroy <appName>')
    .description('Delete an app, its container and its files')
    .action(async (appName: string) => {
      const client = new ApiClient(loadCliConfig());
      const app = await findAppByName(client, appName);
      await client.request(`/api/apps/${app.id}`, { method: 'DELETE' });
      console.log(`✓ Destroyed ${app.path}`);
    });
}
