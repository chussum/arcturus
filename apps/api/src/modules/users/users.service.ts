import type { UserProfile } from '@arcturus/shared';
import { UserRole } from '@arcturus/shared';
import { Injectable } from '@nestjs/common';
import { LocalizedBadRequest, LocalizedNotFound } from '../../common/i18n/localized.exception';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';
import { AppsService } from '../apps/apps.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly appsService: AppsService,
  ) {}

  async list(): Promise<UserProfile[]> {
    const rows = await this.users.list();
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.createdAt,
    }));
  }

  async delete(id: string, requesterId: string): Promise<void> {
    if (id === requesterId) {
      throw new LocalizedBadRequest('users.cannotDeleteSelf');
    }
    const target = await this.users.findById(id);
    if (!target) throw new LocalizedNotFound('users.notFound');
    if (target.role === UserRole.Admin && (await this.users.countAdmins()) <= 1) {
      throw new LocalizedBadRequest('users.cannotDeleteLastAdmin');
    }
    // Clean up real resources (containers/images/static files) before the row
    // delete — the DB cascade only removes apps/deployments rows, not the
    // running containers or on-disk artifacts they own.
    await this.appsService.purgeResourcesForUser(id, target.username);
    await this.users.delete(id);
  }
}
