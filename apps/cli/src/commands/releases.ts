import type { DeploymentSummary } from '@arcturus/shared';
import type { Command } from 'commander';
import { ApiClient } from '../lib/api-client';
import { loadCliConfig } from '../lib/config';
import { findAppByName } from './shared';

export function registerDeploymentsCommand(program: Command): void {
  program
    .command('deployments <appName>')
    .description('Deployment history of an app (newest first)')
    .action(async (appName: string) => {
      const client = new ApiClient(loadCliConfig());
      const app = await findAppByName(client, appName);
      const history = await client.request<DeploymentSummary[]>(`/api/apps/${app.id}/deployments`);

      if (history.length === 0) {
        console.log('No deployments yet.');
        return;
      }
      for (const deployment of history) {
        const marks = [
          deployment.active ? 'live' : '',
          deployment.rollbackable ? 'rollbackable' : '',
        ]
          .filter(Boolean)
          .join(', ');
        console.log(
          `${deployment.status.padEnd(9)} ${new Date(deployment.createdAt).toLocaleString().padEnd(24)} ${deployment.id}${marks ? `  [${marks}]` : ''}`,
        );
      }
    });
}

export function registerRollbackCommand(program: Command): void {
  program
    .command('rollback <appName> <deploymentId>')
    .description('Repoint an app to a previous successful deployment')
    .action(async (appName: string, deploymentId: string) => {
      const client = new ApiClient(loadCliConfig());
      const app = await findAppByName(client, appName);
      await client.request(`/api/apps/${app.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deploymentId }),
      });
      console.log(`✓ ${app.path} rolled back to ${deploymentId}`);
    });
}
