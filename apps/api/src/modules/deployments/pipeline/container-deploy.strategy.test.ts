import { describe, expect, test } from 'bun:test';
import { AppStatus } from '@arcturus/shared';
import type { AppConfig } from '../../../common/config/app-config';
import type {
  BuildLimits,
  ContainerRuntime,
  RunContainerOptions,
} from '../../../infrastructure/container-runtime/container-runtime.port';
import type { EnvCryptoService } from '../../../infrastructure/crypto/env-crypto.service';
import type {
  AppRow,
  DeploymentRow,
  UserRow,
} from '../../../infrastructure/persistence/drizzle/schema';
import type {
  AppsRepository,
  UpdateAppData,
} from '../../../infrastructure/persistence/repositories/apps.repository.port';
import type { DeploymentsRepository } from '../../../infrastructure/persistence/repositories/deployments.repository.port';
import type { PortAllocatorService } from '../port-allocator.service';
import { ContainerDeployStrategy, isPortConflictError } from './container-deploy.strategy';
import type { DeployContext } from './deploy-strategy';

const PORT_CONFLICT = new Error('Bind for 0.0.0.0:30000 failed: port is already allocated');

interface PruneDeps {
  history?: DeploymentRow[];
  imageExists?: (tag: string) => Promise<boolean>;
  removeImage?: (tag: string) => Promise<void>;
}

function makeHarness(
  runContainer: (options: RunContainerOptions) => Promise<string>,
  configOverride: Partial<AppConfig> = {},
  prune: PruneDeps = {},
) {
  const updates: UpdateAppData[] = [];
  const runCalls: RunContainerOptions[] = [];
  const buildLimitsCalls: (BuildLimits | undefined)[] = [];

  const runtime = {
    buildImage: async (
      _contextDir: string,
      _imageTag: string,
      _onOutput: (line: string) => void,
      limits?: BuildLimits,
    ) => {
      buildLimitsCalls.push(limits);
    },
    runContainer: async (options: RunContainerOptions) => {
      runCalls.push(options);
      return runContainer(options);
    },
    imageExists: prune.imageExists ?? (async () => false),
    removeImage: prune.removeImage ?? (async () => {}),
  } as unknown as ContainerRuntime;

  const apps = {
    update: async (_id: string, data: UpdateAppData) => {
      updates.push(data);
    },
  } as AppsRepository;

  const deployments = {
    listByApp: async () => prune.history ?? [],
  } as unknown as DeploymentsRepository;
  const ports = { allocate: async () => 30007 } as PortAllocatorService;
  const config = {
    keepReleases: 5,
    defaultMemoryMb: 1024,
    buildMemoryMb: 0,
    containerUser: '',
    ...configOverride,
  } as AppConfig;
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

  return { strategy, context, updates, runCalls, buildLimitsCalls };
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

describe('ContainerDeployStrategy build vs runtime memory', () => {
  const ONE_MB = 1024 * 1024;

  test('leaves the build uncapped by default while the runtime keeps its cap', async () => {
    const { strategy, context, runCalls, buildLimitsCalls } = makeHarness(
      async () => 'container-1',
      { buildMemoryMb: 0 },
    );

    await strategy.deploy(context);

    // No app-level limit set, so the runtime falls back to defaultMemoryMb (1024).
    expect(runCalls[0]?.memoryBytes).toBe(1024 * ONE_MB);
    // 0 = uncapped: the build receives no limits object at all.
    expect(buildLimitsCalls).toEqual([undefined]);
  });

  test('caps the build independently of the (smaller) runtime limit', async () => {
    const { strategy, context, runCalls, buildLimitsCalls } = makeHarness(
      async () => 'container-1',
      { buildMemoryMb: 8192 },
    );

    await strategy.deploy(context);

    // Runtime stays at its own (much smaller) cap; the build gets the larger one.
    expect(runCalls[0]?.memoryBytes).toBe(1024 * ONE_MB);
    expect(buildLimitsCalls[0]?.memoryBytes).toBe(8192 * ONE_MB);
  });
});

describe('ContainerDeployStrategy image pruning', () => {
  test('a prune failure on a legacy image does not fail the deploy', async () => {
    // A deployment from before tag-safe ids whose tag the daemon now rejects.
    const legacy = { id: 'legacy-bad-', appId: 'app-1', status: 'failed' } as DeploymentRow;
    const { strategy, context, updates } = makeHarness(
      async () => 'container-1',
      {},
      {
        history: [legacy],
        imageExists: async () => {
          throw new Error('(HTTP code 400) unexpected - invalid reference format');
        },
      },
    );

    // Pruning runs after the new container is already live, so its failure must
    // not propagate and flip the deploy to Failed.
    await expect(strategy.deploy(context)).resolves.toBeUndefined();
    expect(updates.at(-1)).toMatchObject({
      status: AppStatus.Running,
      containerId: 'container-1',
    });
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
