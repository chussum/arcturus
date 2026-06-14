import { Injectable } from '@nestjs/common';
import type { AppRow, UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { AppsRepository } from '../../infrastructure/persistence/repositories/apps.repository.port';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';

export interface ResolvedRoute {
  app: AppRow;
  owner: UserRow;
}

/**
 * Maps the gateway's /:username/:appName prefix to a deployed app, with a
 * small TTL cache so high-traffic apps don't hit SQLite on every request.
 */
@Injectable()
export class RouteResolverService {
  private readonly cache = new Map<string, { route: ResolvedRoute | null; expiresAt: number }>();
  private readonly ttlMs = 3000;

  constructor(
    private readonly users: UsersRepository,
    private readonly apps: AppsRepository,
  ) {}

  async resolve(username: string, appName: string): Promise<ResolvedRoute | null> {
    const key = `${username}/${appName}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.route;

    const route = await this.lookup(username, appName);
    this.cache.set(key, { route, expiresAt: Date.now() + this.ttlMs });
    return route;
  }

  /** Drops a cached route immediately, e.g. right after a deploy or delete. */
  invalidate(username: string, appName: string): void {
    this.cache.delete(`${username}/${appName}`);
  }

  private async lookup(username: string, appName: string): Promise<ResolvedRoute | null> {
    const owner = await this.users.findByUsername(username);
    if (!owner) return null;
    const app = await this.apps.findByOwnerAndName(owner.id, appName);
    if (!app) return null;
    return { app, owner };
  }
}
