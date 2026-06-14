import { Module } from '@nestjs/common';
import { DatabaseModule } from './drizzle/database.module';
import { ApiTokensRepository } from './repositories/api-tokens.repository.port';
import { AppSharesRepository } from './repositories/app-shares.repository.port';
import { AppsRepository } from './repositories/apps.repository.port';
import { DeploymentsRepository } from './repositories/deployments.repository.port';
import { DrizzleApiTokensRepository } from './repositories/drizzle-api-tokens.repository';
import { DrizzleAppSharesRepository } from './repositories/drizzle-app-shares.repository';
import { DrizzleAppsRepository } from './repositories/drizzle-apps.repository';
import { DrizzleDeploymentsRepository } from './repositories/drizzle-deployments.repository';
import { DrizzleInvitesRepository } from './repositories/drizzle-invites.repository';
import { DrizzlePasswordResetsRepository } from './repositories/drizzle-password-resets.repository';
import { DrizzleSessionsRepository } from './repositories/drizzle-sessions.repository';
import { DrizzleUsersRepository } from './repositories/drizzle-users.repository';
import { InvitesRepository } from './repositories/invites.repository.port';
import { PasswordResetsRepository } from './repositories/password-resets.repository.port';
import { SessionsRepository } from './repositories/sessions.repository.port';
import { UsersRepository } from './repositories/users.repository.port';

/**
 * Binds every repository port to its Drizzle implementation.
 * Swapping SQLite for PostgreSQL later only touches this module.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: UsersRepository, useClass: DrizzleUsersRepository },
    { provide: SessionsRepository, useClass: DrizzleSessionsRepository },
    { provide: InvitesRepository, useClass: DrizzleInvitesRepository },
    { provide: PasswordResetsRepository, useClass: DrizzlePasswordResetsRepository },
    { provide: ApiTokensRepository, useClass: DrizzleApiTokensRepository },
    { provide: AppsRepository, useClass: DrizzleAppsRepository },
    { provide: AppSharesRepository, useClass: DrizzleAppSharesRepository },
    { provide: DeploymentsRepository, useClass: DrizzleDeploymentsRepository },
  ],
  exports: [
    UsersRepository,
    SessionsRepository,
    InvitesRepository,
    PasswordResetsRepository,
    ApiTokensRepository,
    AppsRepository,
    AppSharesRepository,
    DeploymentsRepository,
  ],
})
export class PersistenceModule {}
