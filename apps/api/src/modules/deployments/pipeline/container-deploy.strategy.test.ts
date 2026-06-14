import { describe, expect, test } from 'bun:test';
import type { AppConfig } from '../../../common/config/app-config';
import type {
  ContainerRuntime,
  RunContainerOptions,
} from '../../../infrastructure/container-runtime/container-runtime.port';
import type { EnvCryptoService } from '../../../infrastructure/crypto/env-crypto.service';
import type { AppRow, UserRow } from '../../../infrastructure/persistence/drizzle/schema';
import type {
  AppsRepository,
  UpdateAppData,
} from '../../../infrastructure/persistence/repositories/apps.repository.port';
import type { DeploymentsRepository } from '../../../infrastructure/persistence/repositories/deployments.repository.port';
import type { PortAllocatorService } from '../port-allocator.service';
import { ContainerDeployStrategy, isPortConflictError } from './container-deploy.strategy';
import type { DeployContext } from './deploy-strategy';

const PORT_CONFLICT = new Error('Bind for 0.0.0.0:30000 failed: port is already allocated');

function makeHarness(runContainer: (options: RunContainerOptions) => Promise<string>) {
  const updates: UpdateAppData[] = [];
  const runCalls: RunContainerOptions[] = [];

  const runtime = {
    buildImage: async () => {},
    runContainer: async (options: RunContainerOptions) => {
      runCalls.push(options);
      return runContainer(options);
    },
    imageExists: async () => false,
  } as unknown as ContainerRuntime;

  const apps = {
    update: async (_id: string, data: UpdateAppData) => {
      updates.push(data);
    },
  } as AppsRepository;

  const deployments = { listByApp: async () => [] } as unknown as DeploymentsRepository;
  const ports = { allocate: async () => 30007 } as PortAllocatorService;
  const config = { keepReleases: 5, defaultMemoryMb: 1024, containerUser: '' } as AppConfig;
  const envCrypto = { decrypt: (value: string) => value } as EnvCryptoService;

  const strategy = new ContainerDeployStrategy(
    runtime,
    apps,
    deployments,
    ports,
    config,
    envCrypto,
  );

  const context: DeployContext = {
    app: { id: 'app-1', name: 'echo', env: '{}', assignedPort: 30000 } as AppRow,
    owner: { id: 'user-1', username: 'alice' } as UserRow,
    deploymentId: 'dep-1',
    projectDir: '/tmp/unused',
    log: async () => {},
  };

  return { strategy, context, updates, runCalls };
}

describe('ContainerDeployStrategy port-conflict recovery', () => {
  test('reassigns a fresh port and retries once when the sticky port is taken', async () => {
    let attempts = 0;
    const { strategy, context, updates, runCalls } = makeHarness(async () => {
      attempts += 1;
      if (attempts === 1) throw PORT_CONFLICT;
      return 'container-1';
    });

    await strategy.deploy(context);

    expect(runCalls.map((call) => call.hostPort)).toEqual([30000, 30007]);
    expect(updates).toContainEqual({ assignedPort: 30007 });
    expect(updates.at(-1)?.containerId).toBe('container-1');
  });

  test('propagates non-port errors without retrying', async () => {
    const { strategy, context, runCalls } = makeHarness(async () => {
      throw new Error('image not found');
    });

    await expect(strategy.deploy(context)).rejects.toThrow('image not found');
    expect(runCalls).toHaveLength(1);
  });

  test('propagates the error when the retry fails too', async () => {
    const { strategy, context, runCalls } = makeHarness(async () => {
      throw PORT_CONFLICT;
    });

    await expect(strategy.deploy(context)).rejects.toThrow(/already allocated/);
    expect(runCalls).toHaveLength(2);
  });
});

describe('isPortConflictError', () => {
  test('matches Docker port-collision phrasings case-insensitively', () => {
    expect(isPortConflictError(new Error('Bind failed: Port is already allocated'))).toBe(true);
    expect(
      isPortConflictError(new Error('listen tcp 0.0.0.0:30000: bind: address already in use')),
    ).toBe(true);
    expect(
      isPortConflictError(new Error('Ports are not available: exposing port TCP 0.0.0.0:30000')),
    ).toBe(true);
    expect(isPortConflictError(new Error('image not found'))).toBe(false);
  });
});
