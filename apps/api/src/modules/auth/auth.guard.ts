import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { LocalizedForbidden, LocalizedUnauthorized } from '../../common/i18n/localized.exception';
import type { UserRow } from '../../infrastructure/persistence/drizzle/schema';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';
import { ApiTokenService } from './api-token.service';
import { SessionService } from './session.service';

/** Methods that don't change state — exempt from the cross-origin write check. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Request augmented by AuthGuard with the authenticated account. */
export interface AuthenticatedRequest extends Request {
  user: UserRow;
}

/**
 * Accepts either of the two credentials the platform issues:
 * a dashboard session cookie (browser) or a bearer API token (CLI).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly apiTokens: ApiTokenService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Cookie auth is ambient (the browser attaches it to every same-site
    // request, including ones triggered by a deployed app on the apps origin),
    // so a state-changing cookie request must prove it came from our own
    // origin. Bearer tokens aren't ambient — an attacker can't read the
    // victim's token cross-origin — so they skip the check (CLI has no Origin).
    const cookieUser = await this.fromSessionCookie(request);
    if (cookieUser) {
      assertSameOriginWrite(request);
      request.user = cookieUser;
      return true;
    }

    const bearerUser = await this.fromBearerToken(request);
    if (!bearerUser) throw new LocalizedUnauthorized('auth.authRequired');

    request.user = bearerUser;
    return true;
  }

  private async fromSessionCookie(request: Request): Promise<UserRow | null> {
    const token = request.cookies?.[SessionService.cookieName];
    if (typeof token !== 'string' || token === '') return null;
    const session = await this.sessions.verify(token);
    if (!session) return null;
    return this.users.findById(session.userId);
  }

  private async fromBearerToken(request: Request): Promise<UserRow | null> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return this.apiTokens.authenticate(header.slice('Bearer '.length));
  }
}

/**
 * Rejects a cookie-authenticated state-changing request that did not originate
 * from the control-plane origin. Deployed apps live on a separate origin
 * (ARCTURUS_APPS_PORT), so their Origin never matches the API's own Host —
 * which is exactly what lets us distinguish them from the dashboard.
 */
function assertSameOriginWrite(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.origin;
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new LocalizedForbidden('auth.originMalformed');
    }
    // request.headers.host is this server's own authority (the control plane).
    if (originHost !== request.headers.host) {
      throw new LocalizedForbidden('auth.crossOriginWrite');
    }
    return;
  }

  // No Origin header: fall back to Fetch Metadata when the browser sends it.
  // A request from another origin carries same-site/cross-site here.
  const site = request.headers['sec-fetch-site'];
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') {
    throw new LocalizedForbidden('auth.crossSiteWrite');
  }
  // Otherwise it's a non-browser client (no Origin, no Fetch Metadata) such as
  // the CLI; those authenticate by bearer token and never reach this branch,
  // but a cookie-bearing curl with neither header is allowed by design.
}
