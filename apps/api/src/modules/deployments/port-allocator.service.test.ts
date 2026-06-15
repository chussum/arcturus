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
  gatewayPort?: number;
  appsPort?: number;
}): PortAllocatorService {
  const config = {
    portPoolStart: options.start,
    portPoolEnd: options.end,
    gatewayPort: options.gatewayPort ?? 7777,
    appsPort: options.appsPort ?? 7778,
  } as AppConfig;
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

describe('PortAllocatorService.validateManualPort', () => {
  test('accepts a free, in-range port', async () => {
    const allocator = makeAllocator({ start: 30000, end: 30999 });
    expect(await allocator.validateManualPort(8080, null)).toEqual({ available: true });
  });

  test("accepts the app's own current port without probing", async () => {
    // 9090 is both DB-assigned and busy, but it's this app's current port → no-op.
    const allocator = makeAllocator({ start: 30000, end: 30999, assigned: [9090], busy: [9090] });
    expect(await allocator.validateManualPort(9090, 9090)).toEqual({ available: true });
  });

  test('rejects ports below 1024 or above 65535', async () => {
    const allocator = makeAllocator({ start: 30000, end: 30999 });
    expect(await allocator.validateManualPort(80, null)).toEqual({
      available: false,
      reason: 'outOfRange',
    });
    expect(await allocator.validateManualPort(70000, null)).toEqual({
      available: false,
      reason: 'outOfRange',
    });
  });

  test('rejects the reserved control/apps ports', async () => {
    const allocator = makeAllocator({
      start: 30000,
      end: 30999,
      gatewayPort: 7777,
      appsPort: 7778,
    });
    expect(await allocator.validateManualPort(7777, null)).toEqual({
      available: false,
      reason: 'reserved',
    });
    expect(await allocator.validateManualPort(7778, null)).toEqual({
      available: false,
      reason: 'reserved',
    });
  });

  test('rejects a port already assigned to another app in the DB', async () => {
    const allocator = makeAllocator({ start: 30000, end: 30999, assigned: [8080] });
    expect(await allocator.validateManualPort(8080, 30001)).toEqual({
      available: false,
      reason: 'taken',
    });
  });

  test('rejects a port that is busy on the host', async () => {
    const allocator = makeAllocator({ start: 30000, end: 30999, busy: [8080] });
    expect(await allocator.validateManualPort(8080, null)).toEqual({
      available: false,
      reason: 'taken',
    });
  });
});
