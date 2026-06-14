import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppStatus, AppType, DeploymentStatus, RouteMode } from '@arcturus/shared';
import { AppConfig } from '../../common/config/app-config';
import { EnvCryptoService } from '../../infrastructure/crypto/env-crypto.service';
import type {
  AppRow,
  DeploymentRow,
  UserRow,
} from '../../infrastructure/persistence/drizzle/schema';
import type { CreateAppData } from '../../infrastructure/persistence/repositories/apps.repository.port';
import { parseEnvColumn } from '../apps/container-env';
import { DeploymentsService } from './deployments.service';

// Only id + username are touched on the create path.
const OWNER = { id: 'user-1', username: 'alice' } as unknown as UserRow;

function appRow(overrides: Partial<AppRow> = {}): AppRow {
  return {
    id: 'app-1',
    userId: OWNER.id,
    name: 'demo',
    description: null,
    type: AppType.Container,
    status: AppStatus.Idle,
    routeMode: RouteMode.Redirect,
    assignedPort: null,
    containerId: null,
    activeDeploymentId: null,
    env: '{}',
    memoryLimitMb: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastDeployedAt: null,
    sharedAllRole: null,
    ...overrides,
  };
}

describe('DeploymentsService env-on-create', () => {
  let dataDir: string;
  let config: AppConfig;
  let envCrypto: EnvCryptoService;
  let created: CreateAppData[];
  let existingApp: AppRow | null;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcturus-deploy-'));
    process.env.ARCTURUS_DATA_DIR = dataDir;
    delete process.env.ARCTURUS_ENV_KEY;
    delete process.env.NODE_ENV;
    config = new AppConfig();
    envCrypto = new EnvCryptoService(config);
    created = [];
    existingApp = null;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function buildService(appsService: unknown = {}): DeploymentsService {
    const apps = {
      findByOwnerAndName: async () => existingApp,
      create: async (data: CreateAppData): Promise<AppRow> => {
        created.push(data);
        return appRow({ env: data.env ?? '{}', type: data.type });
      },
      update: async () => {},
    };
    const deployments = {
      create: async (appId: string): Promise<DeploymentRow> => ({
        id: 'dep-1',
        appId,
        status: DeploymentStatus.Queued,
        buildLog: '',
        finishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      setStatus: async () => {},
      appendBuildLog: async () => {},
    };
    // A no-op container strategy so the fire-and-forget pipeline completes cleanly.
    const strategy = { type: AppType.Container, deploy: async () => {} };

    return new DeploymentsService(
      config,
      apps as never,
      appsService as never, // AppsService — only used on the cross-account path
      deployments as never,
      { extract: makeExtractWithDockerfile() } as never,
      envCrypto,
      [strategy] as never,
    );
  }

  /** Fake ArchiveService.extract: writes a Dockerfile so detectType → container. */
  function makeExtractWithDockerfile() {
    return (_archivePath: string, workDir: string): string => {
      fs.mkdirSync(workDir, { recursive: true });
      fs.writeFileSync(path.join(workDir, 'Dockerfile'), 'FROM scratch\n');
      return workDir;
    };
  }

  function writeArchive(): string {
    const file = path.join(dataDir, 'upload.zip');
    fs.writeFileSync(file, 'dummy');
    return file;
  }

  test('encrypts and seeds env when the app is newly created', async () => {
    const service = buildService();
    await service.create(OWNER, 'demo', writeArchive(), { env: { FOO: 'bar', TOKEN: 'abc' } });

    expect(created).toHaveLength(1);
    const stored = created[0]?.env ?? '';
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(parseEnvColumn(envCrypto.decrypt(stored))).toEqual({ FOO: 'bar', TOKEN: 'abc' });
  });

  test('ignores env when the app already exists', async () => {
    existingApp = appRow({ env: envCrypto.encrypt(JSON.stringify({ KEPT: '1' })) });
    const service = buildService();
    await service.create(OWNER, 'demo', writeArchive(), { env: { FOO: 'bar' } });

    expect(created).toHaveLength(0); // never created → existing env untouched
  });

  test('does not set env when none is supplied', async () => {
    const service = buildService();
    await service.create(OWNER, 'demo', writeArchive(), {});

    expect(created).toHaveLength(1);
    expect(created[0]?.env).toBeUndefined();
  });
});

describe('DeploymentsService cross-account deploy', () => {
  let dataDir: string;
  let config: AppConfig;
  let envCrypto: EnvCryptoService;
  let created: CreateAppData[];

  const REQUESTER = { id: 'user-2', username: 'alice' } as unknown as UserRow;
  const BOB = { id: 'user-1', username: 'bob' } as unknown as UserRow;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcturus-deploy-xacct-'));
    process.env.ARCTURUS_DATA_DIR = dataDir;
    delete process.env.ARCTURUS_ENV_KEY;
    delete process.env.NODE_ENV;
    config = new AppConfig();
    envCrypto = new EnvCryptoService(config);
    created = [];
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function appRow(overrides: Partial<AppRow> = {}): AppRow {
    return {
      id: 'app-bob',
      userId: BOB.id,
      name: 'demo',
      description: null,
      type: AppType.Container,
      status: AppStatus.Idle,
      routeMode: RouteMode.Redirect,
      assignedPort: null,
      containerId: null,
      activeDeploymentId: null,
      env: '{}',
      memoryLimitMb: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastDeployedAt: null,
      sharedAllRole: null,
      ...overrides,
    };
  }

  /** Records the pipeline owner + whether the own-account lookup ran, to assert the chosen path. */
  function buildService(appsService: unknown): {
    service: DeploymentsService;
    deployedOwner: () => string | null;
    ownLookupCalled: () => boolean;
  } {
    let ranAs: string | null = null;
    let ownLookup = false;
    const apps = {
      findByOwnerAndName: async () => {
        ownLookup = true;
        return null; // own path → would create
      },
      create: async (data: CreateAppData): Promise<AppRow> => {
        created.push(data);
        return appRow();
      },
      update: async () => {},
    };
    const deployments = {
      create: async (appId: string): Promise<DeploymentRow> => ({
        id: 'dep-1',
        appId,
        status: DeploymentStatus.Queued,
        buildLog: '',
        finishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      setStatus: async () => {},
      appendBuildLog: async () => {},
    };
    const strategy = {
      type: AppType.Container,
      deploy: async (ctx: { owner: UserRow }) => {
        ranAs = ctx.owner.username;
      },
    };
    const extract = (_archivePath: string, workDir: string): string => {
      fs.mkdirSync(workDir, { recursive: true });
      fs.writeFileSync(path.join(workDir, 'Dockerfile'), 'FROM scratch\n');
      return workDir;
    };

    const service = new DeploymentsService(
      config,
      apps as never,
      appsService as never,
      deployments as never,
      { extract } as never,
      envCrypto,
      [strategy] as never,
    );
    return { service, deployedOwner: () => ranAs, ownLookupCalled: () => ownLookup };
  }

  function writeArchive(): string {
    const file = path.join(dataDir, 'upload.zip');
    fs.writeFileSync(file, 'dummy');
    return file;
  }

  test('deploys to the resolved owner app and runs the pipeline as that owner', async () => {
    const appsService = {
      resolveManagedAppByRef: async () => ({ app: appRow(), owner: BOB }),
    };
    const { service, deployedOwner, ownLookupCalled } = buildService(appsService);

    const summary = await service.create(REQUESTER, 'demo', writeArchive(), {
      ownerUsername: 'bob',
    });

    expect(summary.appId).toBe('app-bob');
    expect(created).toHaveLength(0); // never created under the requester
    expect(ownLookupCalled()).toBe(false); // resolver path, not own-account lookup
    // Let the fire-and-forget pipeline settle, then confirm it keyed off bob, not alice.
    await new Promise((r) => setTimeout(r, 10));
    expect(deployedOwner()).toBe('bob');
  });

  test('rejects when the resolver denies access (owner/app missing or no manage)', async () => {
    const appsService = {
      resolveManagedAppByRef: async () => {
        throw new Error('App not found');
      },
    };
    const { service } = buildService(appsService);

    await expect(
      service.create(REQUESTER, 'demo', writeArchive(), { ownerUsername: 'bob' }),
    ).rejects.toThrow('App not found');
    expect(created).toHaveLength(0);
  });

  test('rejects on a cross-account app type mismatch', async () => {
    const appsService = {
      // Resolver returns a static app, but the archive has a Dockerfile → container.
      resolveManagedAppByRef: async () => ({ app: appRow({ type: AppType.Static }), owner: BOB }),
    };
    const { service } = buildService(appsService);

    await expect(
      service.create(REQUESTER, 'demo', writeArchive(), { ownerUsername: 'bob' }),
    ).rejects.toThrow();
  });

  test('treats ownerUsername equal to the requester as an own deploy (no resolver call)', async () => {
    let resolverCalled = false;
    const appsService = {
      resolveManagedAppByRef: async () => {
        resolverCalled = true;
        return { app: appRow(), owner: BOB };
      },
    };
    const { service, ownLookupCalled } = buildService(appsService);

    await service.create(REQUESTER, 'demo', writeArchive(), { ownerUsername: 'alice' });

    expect(resolverCalled).toBe(false); // same username → own path
    expect(ownLookupCalled()).toBe(true); // resolved via findByOwnerAndName under the requester
    expect(created).toHaveLength(1); // own app created
  });
});
