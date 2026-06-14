import type { AppSummary } from '@arcturus/shared';
import type { ApiClient } from '../lib/api-client';

/** Resolves one of the caller's apps by name, with a helpful failure. */
export async function findAppByName(client: ApiClient, appName: string): Promise<AppSummary> {
  const apps = await client.request<AppSummary[]>('/api/apps');
  const app = apps.find((candidate) => candidate.name === appName);
  if (!app) {
    throw new Error(
      `No app named "${appName}". Yours: ${apps.map((a) => a.name).join(', ') || '(none)'}`,
    );
  }
  return app;
}
