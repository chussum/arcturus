import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { I18nExceptionFilter } from './common/i18n/i18n-exception.filter';
import { DatabaseModule } from './infrastructure/persistence/drizzle/database.module';
import { AppsModule } from './modules/apps/apps.module';
import { AuthModule } from './modules/auth/auth.module';
import { CliDistModule } from './modules/cli-dist/cli-dist.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { InvitesModule } from './modules/invites/invites.module';
import { LogsModule } from './modules/logs/logs.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // Rate-limit config is registered ONCE here: ThrottlerModule is @Global(),
    // so a second forRoot() elsewhere silently overrides this for every route.
    // Routes opt in with @UseGuards(ThrottlerGuard); a different budget is a
    // per-route @Throttle({ default: {...} }) override, never another forRoot.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    DatabaseModule,
    AuthModule,
    UsersModule,
    InvitesModule,
    AppsModule,
    DeploymentsModule,
    LogsModule,
    CliDistModule,
    GatewayModule,
  ],
  providers: [
    // Translates LocalizedException message keys via Accept-Language.
    // Must be registered here (not in individual modules) so it covers all routes.
    { provide: APP_FILTER, useClass: I18nExceptionFilter },
  ],
})
export class AppModule {}
