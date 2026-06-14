import { AppType, RouteMode } from '@arcturus/shared';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../../common/config/app-config';
import { GATEWAY_BYPASS_SEGMENTS } from '../../common/reserved-paths';
import { StaticSitesService } from '../../infrastructure/storage/static-sites.service';
import { ContainerProxyService } from './container-proxy.service';
import { DashboardUpstreamService } from './dashboard-upstream.service';
import { type ResolvedRoute, RouteResolverService } from './route-resolver.service';

/**
 * The public face of every deployed app: requests shaped like
 * /:username/:appName/* are answered here; everything else falls through to
 * the regular API routes.
 *
 * Apps that reference assets by absolute path (/static/app.js) lose the
 * prefix — those requests match no route, so we recover them by looking at
 * the Referer header (see resolveViaReferer).
 */
@Injectable()
export class GatewayMiddleware implements NestMiddleware {
  constructor(
    private readonly routes: RouteResolverService,
    private readonly staticSites: StaticSitesService,
    private readonly containerProxy: ContainerProxyService,
    private readonly config: AppConfig,
    private readonly dashboardUpstream: DashboardUpstreamService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.route(req, res, next);
    } catch (error) {
      // A malformed request must not crash the shared gateway for everyone.
      if (!res.headersSent) res.status(400).send('Bad request');
      else next(error);
    }
  }

  private async route(req: Request, res: Response, next: NextFunction): Promise<void> {
    // req.path is relative to the middleware mount point; originalUrl is not.
    const fullPath = (req.originalUrl.split('?')[0] ?? '/').replace(/\/{2,}/g, '/');
    const segments = fullPath.split('/').filter(Boolean);
    const [username, appName] = segments;

    // Deployed apps answer on their own port (a distinct origin) so their JS
    // is sandboxed away from the control-plane cookie. That listener serves
    // ONLY app traffic — it must never reach the API or dashboard routes.
    // Use the internal listen port for branching — when running behind the ingress,
    // listenAppsPort differs from the public appsPort. URL-building code (line ~79)
    // still uses the public appsPort so clients get the correct redirect target.
    if (req.socket.localPort === this.config.listenAppsPort) {
      await this.routeAppsPort(req, res, username, appName, fullPath);
      return;
    }

    if (!username) {
      // The bare host is the dashboard's front door.
      res.redirect(302, '/dashboard');
      return;
    }

    // The dashboard (a Next.js server) lives behind the control-plane port.
    if (username === 'dashboard' || username === '_next') {
      // Pass a resolver so the probe/retry inside forwardToOrigin picks up a
      // concurrent web-swap flip without re-reading the state file at the call site.
      await this.containerProxy.forwardToOrigin(
        req,
        res,
        () => this.dashboardUpstream.currentOrigin(),
        fullPath,
      );
      return;
    }

    if (GATEWAY_BYPASS_SEGMENTS.has(username)) {
      next();
      return;
    }

    // Anything else is app traffic that landed on the control-plane port
    // (an old bookmark or a dashboard link): bounce it to the apps origin so
    // the app and its assets all load under the sandboxed origin.
    res.redirect(302, `http://${req.hostname}:${this.config.appsPort}${fullPath}`);
  }

  /** The apps-port listener: resolves and serves apps, and 404s everything else. */
  private async routeAppsPort(
    req: Request,
    res: Response,
    username: string | undefined,
    appName: string | undefined,
    fullPath: string,
  ): Promise<void> {
    // Reserved/control segments are never apps; refuse to serve them from the
    // apps origin so the API and dashboard stay control-plane-only.
    if (!username || GATEWAY_BYPASS_SEGMENTS.has(username)) {
      res.status(404).send('Not found');
      return;
    }

    const route = appName ? await this.routes.resolve(username, appName) : null;
    if (route) {
      this.serveApp(req, res, route, fullPath);
      return;
    }

    const fallback = await this.resolveViaReferer(req);
    if (fallback) {
      // The apps port has nothing to fall through to, so handle (or 404) here.
      this.serveFallback(req, res, () => res.status(404).send('Not found'), fallback, fullPath);
      return;
    }

    res.status(404).send('Not found');
  }

  private serveApp(req: Request, res: Response, route: ResolvedRoute, fullPath: string): void {
    const prefix = `/${route.owner.username}/${route.app.name}`;

    if (route.app.type === AppType.Static) {
      this.serveStatic(res, route, fullPath);
      return;
    }

    if (route.app.assignedPort === null) {
      res.status(503).send('App has no successful deployment yet');
      return;
    }

    if (route.app.routeMode === RouteMode.Redirect) {
      const innerPath = fullPath.slice(prefix.length) || '/';
      res.redirect(302, `http://${req.hostname}:${route.app.assignedPort}${innerPath}`);
      return;
    }

    this.containerProxy.forward(req, res, {
      hostPort: route.app.assignedPort,
      stripPrefix: prefix,
      fullPath,
    });
  }

  /**
   * Serves a request that only makes sense in the context of the app the
   * browser is currently viewing (absolute-path assets, fetch calls).
   * The path is forwarded unmodified — the app already lives at /.
   */
  private serveFallback(
    req: Request,
    res: Response,
    next: NextFunction,
    route: ResolvedRoute,
    fullPath: string,
  ): void {
    if (route.app.type === AppType.Static) {
      const decoded = safeDecode(fullPath);
      if (decoded === null) {
        res.status(400).send('Bad request');
        return;
      }
      const resolution = this.staticSites.resolveFile(
        route.owner.username,
        route.app.name,
        decoded,
        route.app.activeDeploymentId,
      );
      if (resolution.kind === 'file') {
        res.sendFile(resolution.filePath);
        return;
      }
      next();
      return;
    }

    if (route.app.assignedPort === null) {
      next();
      return;
    }
    this.containerProxy.forward(req, res, { hostPort: route.app.assignedPort, fullPath });
  }

  private serveStatic(res: Response, route: ResolvedRoute, fullPath: string): void {
    const prefix = `/${route.owner.username}/${route.app.name}`;
    const innerPath = safeDecode(fullPath.slice(prefix.length));
    if (innerPath === null) {
      res.status(400).send('Bad request');
      return;
    }

    const resolution = this.staticSites.resolveFile(
      route.owner.username,
      route.app.name,
      innerPath,
      route.app.activeDeploymentId,
    );
    switch (resolution.kind) {
      case 'file':
        res.sendFile(resolution.filePath);
        return;
      case 'redirect-add-slash':
        res.redirect(302, `${prefix}${innerPath}/`);
        return;
      case 'not-found':
        res.status(404).send('Not found');
        return;
    }
  }

  /** Extracts /:username/:appName from the Referer and resolves it to an app. */
  private async resolveViaReferer(req: Request): Promise<ResolvedRoute | null> {
    const referer = req.headers.referer;
    if (!referer) return null;

    let refererPath: string;
    try {
      refererPath = new URL(referer).pathname;
    } catch {
      return null;
    }

    const [username, appName] = refererPath.split('/').filter(Boolean);
    if (!username || !appName || GATEWAY_BYPASS_SEGMENTS.has(username)) return null;
    return this.routes.resolve(username, appName);
  }
}

/** decodeURIComponent throws on malformed escapes (e.g. a bare `%`); null on failure. */
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
