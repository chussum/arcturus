import type { AppSummary } from '@arcturus/shared';
import type { Command } from 'commander';
import { ApiClient } from '../lib/api-client';
import { loadCliConfig } from '../lib/config';

export function registerAppsCommand(program: Command): void {
  program
    .command('apps')
    .description('List your deployed apps')
    .action(async () => {
      const client = new ApiClient(loadCliConfig());
      const apps = await client.request<AppSummary[]>('/api/apps');

      if (apps.length === 0) {
        console.log('No apps yet. Run `arcturus deploy` in a project directory.');
        return;
      }
      for (const app of apps) {
        const port = app.assignedPort ? ` :${app.assignedPort}` : '';
        console.log(`${app.status.padEnd(8)} ${app.type.padEnd(10)} ${app.path.padEnd(28)}${port}`);
      }
    });
}
