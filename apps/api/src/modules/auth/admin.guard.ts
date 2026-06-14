import { UserRole } from '@arcturus/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { LocalizedForbidden } from '../../common/i18n/localized.exception';
import type { AuthenticatedRequest } from './auth.guard';

/** Allows only admins. Must run after AuthGuard so request.user is set. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== UserRole.Admin) {
      throw new LocalizedForbidden('auth.adminRequired');
    }
    return true;
  }
}
