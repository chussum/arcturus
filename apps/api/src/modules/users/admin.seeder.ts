import { UserRole } from '@arcturus/shared';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { AppConfig } from '../../common/config/app-config';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';
import { PasswordService } from '../auth/password.service';

/**
 * First-run bootstrap: when the platform has no accounts yet, create the
 * super-admin. The password comes from ARCTURUS_ADMIN_PASSWORD, or is
 * generated and printed to the console exactly once.
 */
@Injectable()
export class AdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeeder.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const existing = await this.users.list();
    if (existing.length > 0) return;

    if (!this.config.adminPassword && this.config.isProduction) {
      throw new Error(
        'ARCTURUS_ADMIN_PASSWORD must be set in production for the initial admin seed. ' +
          'Refusing to generate one and print it to the logs, which may be world-readable.',
      );
    }

    const password = this.config.adminPassword || nanoid(16);
    await this.users.create({
      username: 'admin',
      passwordHash: await this.passwords.hash(password),
      role: UserRole.Admin,
    });

    if (this.config.adminPassword) {
      this.logger.log('Seeded admin account (password from ARCTURUS_ADMIN_PASSWORD)');
    } else {
      // Intentionally loud: this is the only time the generated password is visible.
      this.logger.warn(`Seeded admin account — username: admin / password: ${password}`);
      this.logger.warn('Store this password now; it will not be shown again.');
    }
  }
}
