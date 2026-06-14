import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { AdminGuard } from './admin.guard';
import { ApiTokenService } from './api-token.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PasswordResetService } from './password-reset.service';
import { SessionService } from './session.service';
import { TokensController } from './tokens.controller';

@Module({
  // Credential endpoints (login/signup/token create) use the global 10/min
  // throttler from AppModule, applied per-route — never add forRoot here.
  imports: [PersistenceModule],
  controllers: [AuthController, TokensController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    ApiTokenService,
    AuthGuard,
    AdminGuard,
    PasswordResetService,
  ],
  exports: [
    AuthGuard,
    AdminGuard,
    SessionService,
    ApiTokenService,
    PasswordService,
    PasswordResetService,
  ],
})
export class AuthModule {}
