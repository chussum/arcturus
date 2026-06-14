import type { Command } from 'commander';
import { ApiClient } from '../lib/api-client';
import { loadCliConfig } from '../lib/config';
import { findAppByName } from './shared';

export function registerEnvCommand(program: Command): void {
  program
    .command('env <appName>')
    .description("Show or change a container app's environment variables")
    .option('--set <KEY=value...>', 'set one or more variables', collect, [])
    .option('--unset <KEY...>', 'remove one or more variables', collect, [])
    .action(async (appName: string, options: { set: string[]; unset: string[] }) => {
      const client = new ApiClient(loadCliConfig());
      const app = await findAppByName(client, appName);

      if (options.set.length === 0 && options.unset.length === 0) {
        const entries = Object.entries(app.env);
        if (entries.length === 0) {
          console.log('(no variables)');
          return;
        }
        for (const [key, value] of entries) console.log(`${key}=${value}`);
        return;
      }

      const env: Record<string, string> = { ...app.env };
      for (const pair of options.set) {
        const separator = pair.indexOf('=');
        if (separator === -1) throw new Error(`--set expects KEY=value, got "${pair}"`);
        env[pair.slice(0, separator)] = pair.slice(separator + 1);
      }
      for (const key of options.unset) delete env[key];

      await client.request<{ ok: true }>(`/api/apps/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env }),
      });
      console.log(`✓ env updated (${Object.keys(env).length} vars) — container restarted`);
    });
}

/** Commander variadic accumulator. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
