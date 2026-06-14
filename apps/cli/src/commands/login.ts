import type { AuthResponse } from '@arcturus/shared';
import type { Command } from 'commander';
import { ApiClient } from '../lib/api-client';
import { saveCliConfig } from '../lib/config';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Save server URL and API token (create one in the dashboard under API Tokens)')
    .requiredOption('--server <url>', 'platform URL, e.g. http://192.168.0.10:7777')
    .requiredOption('--token <token>', 'API token (arc_…)')
    .action(async (options: { server: string; token: string }) => {
      const config = { serverUrl: options.server.replace(/\/$/, ''), token: options.token };
      const client = new ApiClient(config);
      const { user } = await client.request<AuthResponse>('/api/auth/me');
      saveCliConfig(config);
      console.log(`✓ Logged in as ${user.username} (${config.serverUrl})`);
    });
}
