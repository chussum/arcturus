import { describe, expect, test } from 'bun:test';
import { UserRole } from '@arcturus/shared';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import type { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';
import type { AppsService } from '../apps/apps.service';
import { UsersService } from './users.service';

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-2',
    username: 'bob',
    role: UserRole.Member,
    passwordHash: 'x',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as UserRow;
}

type Call = string;

function buildService(target: UserRow | null, adminCount = 2) {
  const calls: Call[] = [];
  const users = {
    findById: async () => target,
    countAdmins: async () => adminCount,
    delete: async () => {
      calls.push('users.delete');
    },
  } as unknown as UsersRepository;
  const appsService = {
    purgeResourcesForUser: async () => {
      calls.push('purge');
    },
  } as unknown as AppsService;
  return { service: new UsersService(users, appsService), calls };
}

describe('UsersService.delete', () => {
  test('purges app resources before deleting the user row', async () => {
    const { service, calls } = buildService(userRow());
    await service.delete('user-2', 'admin-1');
    expect(calls).toEqual(['purge', 'users.delete']);
  });

  test('does not purge or delete when removing self', async () => {
    const { service, calls } = buildService(userRow({ id: 'admin-1' }));
    await expect(service.delete('admin-1', 'admin-1')).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test('does not purge or delete the last remaining admin', async () => {
    const { service, calls } = buildService(userRow({ role: UserRole.Admin }), 1);
    await expect(service.delete('user-2', 'admin-1')).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
