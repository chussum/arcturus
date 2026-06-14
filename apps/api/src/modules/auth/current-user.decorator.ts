import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import type { AuthenticatedRequest } from './auth.guard';

/** Injects the account attached by AuthGuard into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserRow => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  },
);
