import { describe, expect, test } from 'bun:test';
import { AppStatus, AppType } from '@arcturus/shared';
import type { ContainerRuntime } from '../../infrastructure/container-runtime/container-runtime.port';
import type { AppRow } from '../../infrastructure/persistence/drizzle/schema';
import type { AppsRepository } from '../../infrastructure/persistence/repositories/apps.repository.port';
import { ContainerStateReconciler } from './container-state.reconciler';

type Managed = { id: string; appId: string | null };

function makeReconciler(opts: {
  rows: AppRow[];
  managed: Managed[];
  getState?: (id: string) => Promise<'running' | 'stopped' | 'missing'>;
  listManaged?: () => Promise<Managed[]>;
}) {
  const removed: string[] = [];

  const runtime = {
    getState: opts.getState ?? (async () => 'running' as const),
    listManaged: opts.listManaged ?? (async () => opts.managed),
    removeContainer: async (id: string) => {
      removed.push(id);
    },
  } as unknown as ContainerRuntime;

  const apps = {
    list: async () => opts.rows,
    update: async () => {},
  } as unknown as AppsRepository;

  return { reconciler: new ContainerStateReconciler(apps, runtime), removed };
}

function containerApp(id: string, containerId: string): AppRow {
  return {
    id,
    name: id,
    type: AppType.Container,
    status: AppStatus.Running,
    containerId,
  } as unknown as AppRow;
}

describe('ContainerStateReconciler orphan sweep', () => {
  test('removes managed containers whose app row is gone, keeps live + legacy', async () => {
    const { reconciler, removed } = makeReconciler({
      rows: [containerApp('app-live', 'c-live')],
      managed: [
        { id: 'c-live', appId: 'app-live' }, // app still exists → keep
        { id: 'c-orphan', appId: 'app-gone' }, // app deleted → sweep
        { id: 'c-legacy', appId: null }, // pre-label container → never sweep
      ],
    });

    await reconciler.onApplicationBootstrap();

    expect(removed).toEqual(['c-orphan']);
  });

  test('does not throw when listManaged fails (best-effort)', async () => {
    const { reconciler, removed } = makeReconciler({
      rows: [],
      managed: [],
      listManaged: async () => {
        throw new Error('docker down');
      },
    });

    await reconciler.onApplicationBootstrap();

    expect(removed).toEqual([]);
  });

  test('continues sweeping after a removeContainer failure', async () => {
    const removed: string[] = [];
    const runtime = {
      getState: async () => 'running' as const,
      listManaged: async () => [
        { id: 'c-bad', appId: 'gone-1' },
        { id: 'c-good', appId: 'gone-2' },
      ],
      removeContainer: async (id: string) => {
        removed.push(id);
        if (id === 'c-bad') throw new Error('busy');
      },
    } as unknown as ContainerRuntime;
    const apps = { list: async () => [], update: async () => {} } as unknown as AppsRepository;

    const reconciler = new ContainerStateReconciler(apps, runtime);
    await reconciler.onApplicationBootstrap();

    expect(removed).toEqual(['c-bad', 'c-good']);
  });
});
