import fs from 'node:fs';
import path from 'node:path';
import type { AppSummary, DeploymentSummary } from '@arcturus/shared';
import type { Command } from 'commander';
import { ApiClient } from '../lib/api-client';
import { parseAppRef, pickCrossAccountCandidates } from '../lib/app-ref';
import { loadCliConfig, loadProjectConfig } from '../lib/config';
import { parseEnvFile } from '../lib/env-file';
import { packProject } from '../lib/pack';
import { selectOption } from '../lib/prompt';

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy')
    .description('Zip the current directory and deploy it (Dockerfile → container, else static)')
    .option('--name <appName>', 'app name (defaults to arcturus.json "name" or the directory name)')
    .option('--dir <path>', 'project directory', '.')
    .option('--env-file <path>', 'env file to seed a new container app (default: .env in the dir)')
    .option('--no-env-file', 'do not read any .env file when deploying')
    .action(async (options: { name?: string; dir: string; envFile?: string | boolean }) => {
      const config = loadCliConfig();
      const client = new ApiClient(config);

      const projectDir = path.resolve(options.dir);
      const rawName =
        options.name ?? loadProjectConfig(projectDir).name ?? path.basename(projectDir);
      const ref = parseAppRef(rawName);
      const appName = ref.name;

      const myUsername = await currentUsername(client);
      // Explicit `owner/app` targets that account; a bare name may prompt (see resolveTargetOwner).
      const targetOwner = await resolveTargetOwner(client, ref, myUsername);
      const crossAccount = targetOwner !== undefined && targetOwner !== myUsername;

      // Env seeding only ever applies to your own brand-new container app; a cross-account
      // target always already exists, so the server ignores env there — skip it to avoid noise.
      const { env, envFileBasename } = crossAccount
        ? { env: undefined, envFileBasename: undefined }
        : resolveDeployEnv(projectDir, options.envFile);

      console.log(`Packing ${projectDir}…`);
      // `.env*` files are always excluded; envFileBasename covers a non-.env --env-file.
      const archive = packProject(projectDir, envFileBasename ? [envFileBasename] : []);
      const kB = (archive.length / 1024).toFixed(0);

      const ownerPrefix = targetOwner ?? myUsername;
      const label = `${ownerPrefix}/${appName}`;

      // Show a live percentage on TTY; fall back to a single status line on pipes/CI.
      const isTTY = process.stdout.isTTY ?? false;
      let lastPct = -1;

      if (!isTTY) {
        console.log(`Uploading ${label} (${kB} KB)…`);
      }

      const fields: Record<string, string> = { appName };
      if (crossAccount && targetOwner) fields.owner = targetOwner;
      if (env) fields.env = JSON.stringify(env);
      const deployment = await client.requestUpload<DeploymentSummary>(
        '/api/deployments',
        fields,
        { name: 'project.zip', bytes: archive },
        isTTY
          ? (fraction) => {
              const pct = Math.floor(fraction * 100);
              if (pct !== lastPct) {
                lastPct = pct;
                process.stdout.write(`\rUploading ${label} (${kB} KB)… ${pct}%`);
              }
            }
          : undefined,
      );

      if (isTTY) process.stdout.write('\n');

      const finalStatus = await client.streamSse(
        `/api/deployments/${deployment.id}/build-log`,
        (line) => console.log(`  ${line}`),
      );

      if (finalStatus === 'running') {
        console.log(`✓ Deployed — ${config.serverUrl}/${ownerPrefix}/${appName}/`);
      } else {
        throw new Error(`Deployment ${finalStatus ?? 'ended unexpectedly'}`);
      }
    });
}

/**
 * Decides which account to deploy to. An explicit `owner/app` always targets that owner
 * (no prompt). A bare name targets your own account — unless a same-named app you `manage`
 * exists under another owner and stdin is a TTY, in which case we ask. Returns the chosen
 * owner username, or undefined for your own account.
 */
async function resolveTargetOwner(
  client: ApiClient,
  ref: { owner?: string; name: string },
  myUsername: string,
): Promise<string | undefined> {
  if (ref.owner) return ref.owner === myUsername ? undefined : ref.owner;
  if (!(process.stdin.isTTY ?? false)) return undefined;

  const apps = await client.request<AppSummary[]>('/api/apps');
  const candidates = pickCrossAccountCandidates(apps, ref.name, myUsername);
  if (candidates.length === 0) return undefined;

  return selectOption<string | undefined>(
    `An app named "${ref.name}" exists in more than one account:`,
    [
      { label: `${myUsername}/${ref.name} (your account)`, value: undefined },
      ...candidates.map((c) => ({
        label: `${c.ownerUsername}/${ref.name} (shared · manage)`,
        value: c.ownerUsername,
      })),
    ],
  );
}

/**
 * Resolves the env to seed a new container app from a local env file.
 * Env only applies to container (Dockerfile) apps and only on first creation —
 * the server ignores it when redeploying an app that already exists.
 *
 * `envFile`: undefined → default `.env`; a string → explicit path (must exist);
 * `false` (--no-env-file) → skip entirely.
 */
function resolveDeployEnv(
  projectDir: string,
  envFile: string | boolean | undefined,
): { env?: Record<string, string>; envFileBasename?: string } {
  if (envFile === false) return {};

  const explicit = typeof envFile === 'string';
  const envPath = explicit ? path.resolve(projectDir, envFile) : path.join(projectDir, '.env');

  if (!fs.existsSync(envPath)) {
    if (explicit) throw new Error(`--env-file: ${envPath} not found`);
    return {};
  }

  if (!fs.existsSync(path.join(projectDir, 'Dockerfile'))) {
    if (explicit) {
      console.log('Note: env files apply only to container (Dockerfile) apps — ignoring.');
    }
    return {};
  }

  const env = parseEnvFile(envPath);
  const count = Object.keys(env).length;
  const basename = path.basename(envPath);
  console.log(
    `Found ${basename} (${count} var${count === 1 ? '' : 's'}) — applied as env on first deploy`,
  );
  return { env, envFileBasename: basename };
}

async function currentUsername(client: ApiClient): Promise<string> {
  const { user } = await client.request<{ user: { username: string } }>('/api/auth/me');
  return user.username;
}
