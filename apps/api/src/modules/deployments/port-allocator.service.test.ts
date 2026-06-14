import { describe, expect, test } from 'bun:test';
import type { AppConfig } from '../../common/config/app-config';
import type { AppsRepository } from '../../infrastructure/persistence/repositories/apps.repository.port';
import { PortAllocatorService } from './port-allocator.service';
import type { PortProbeService } from './port-probe.service';

function makeAllocator(options: {
  start: number;
  end: number;
  assigned?: number[];
  busy?: number[];
}): PortAllocatorService {
  const config = { portPoolStart: options.start, portPoolEnd: options.end } as AppConfig;
  const apps = {
    listAssignedPorts: async () => options.assigned ?? [],
  } as AppsRepository;
  const probe = {
    isFree: async (port: number) => !(options.busy ?? []).includes(port),
  } as PortProbeService;
  return new PortAllocatorService(config, apps, probe);
}

describe('PortAllocatorService', () => {
  test('returns a port within the pool', async () => {
    const allocator = makeAllocator({ start: 30000, end: 30004 });
    const port = await allocator.allocate();
    expect(port).toBeGreaterThanOrEqual(30000);
    expect(port).toBeLessThanOrEqual(30004);
  });

  test('skips ports assigned in the DB', async () => {
    const allocator = makeAllocator({ start: 30000, end: 30002, assigned: [30000, 30002] });
    expect(await allocator.allocate()).toBe(30001);
  });

  test('skips ports that are busy on the host even when free in the DB', async () => {
    const allocator = makeAllocator({ start: 30000, end: 30002, busy: [30000, 30001] });
    expect(await allocator.allocate()).toBe(30002);
  });

  test('covers the whole pool despite the random scan start', async () => {
    // Only one free port: every run must find it regardless of the offset.
    for (let i = 0; i < 25; i++) {
      const allocator = makeAllocator({
        start: 30000,
        end: 30009,
        assigned: [30000, 30001, 30002, 30003, 30004],
        busy: [30005, 30006, 30008, 30009],
      });
      expect(await allocator.allocate()).toBe(30007);
    }
  });

  test('throws when the pool is exhausted', async () => {
    const allocator = makeAllocator({ start: 30000, end: 30001, assigned: [30000], busy: [30001] });
    await expect(allocator.allocate()).rejects.toThrow(/Port pool exhausted/);
  });
});
