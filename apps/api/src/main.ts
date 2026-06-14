import 'reflect-metadata';
import http from 'node:http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './common/config/app-config';

async function bootstrap(): Promise<void> {
  // forceCloseConnections: the gateway holds long-lived sockets (SSE log
  // streams, keep-alive) that would otherwise keep app.close() waiting forever.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    forceCloseConnections: true,
  });
  // SIGINT/SIGTERM (pm2 stop/restart) → stop listening, finish in-flight
  // responses, run shutdown hooks (DB close). pm2 allows kill_timeout for this.
  app.enableShutdownHooks();
  app.use(cookieParser());
  app.use(securityHeaders);

  const config = app.get(AppConfig);

  // Behind a TLS-terminating proxy, req.secure/req.ip/req.protocol must come
  // from X-Forwarded-* or Secure cookies and per-IP rate limits silently break.
  if (config.trustProxy !== '') {
    app.set('trust proxy', config.trustProxy);
  }

  // A second listener on the same Express instance serves deployed apps from
  // their own origin (the gateway middleware branches on req.socket.localPort).
  // Keeping it on one process means it shares the DB, services and shutdown.
  const appsServer = http.createServer(app.getHttpAdapter().getInstance());

  try {
    // When running behind the ingress proxy, listenGatewayPort/listenAppsPort are
    // the internal loopback ports; the public ports (7777/7778) stay with ingress.
    // Without ingress, listen == public (default behaviour, fully backwards-compatible).
    await app.listen(config.listenGatewayPort);
    await new Promise<void>((resolve, reject) => {
      appsServer.once('error', reject);
      appsServer.listen(config.listenAppsPort, () => resolve());
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
      Logger.error(
        `Listen port ${config.listenGatewayPort} (ARCTURUS_LISTEN_PORT) or ` +
          `${config.listenAppsPort} (ARCTURUS_LISTEN_APPS_PORT) is already in use. ` +
          'When running behind the ingress, api-swap.sh probes a free port first; ' +
          'a collision here usually means a leftover process from a previous swap. ' +
          'Set ARCTURUS_LISTEN_PORT / ARCTURUS_LISTEN_APPS_PORT explicitly if needed. ' +
          '(Public ports — ARCTURUS_PORT / ARCTURUS_APPS_PORT — are held by the ingress.)',
        'Bootstrap',
      );
      process.exit(1);
    }
    throw error;
  }

  // The apps server is outside Nest's lifecycle, so drain it on the same
  // signals (forceCloseConnections handles the Nest server; mirror that here).
  const closeAppsServer = (): void => {
    (appsServer as { closeAllConnections?: () => void }).closeAllConnections?.();
    appsServer.close();
  };
  process.once('SIGINT', closeAppsServer);
  process.once('SIGTERM', closeAppsServer);

  const listenNote =
    config.listenGatewayPort !== config.gatewayPort
      ? ` (listening internally on :${config.listenGatewayPort}/:${config.listenAppsPort})`
      : '';
  Logger.log(
    `Arcturus control plane on http://127.0.0.1:${config.gatewayPort} — ` +
      `deployed apps on http://127.0.0.1:${config.appsPort}${listenNote}`,
    'Bootstrap',
  );
}

/**
 * Minimal security headers (no helmet dependency). Frame/referrer hardening is
 * scoped to the platform's own surfaces; deployed user apps are left untouched
 * so they remain free to set their own framing policy.
 */
function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const path = req.originalUrl.split('?')[0] ?? '';
  if (path === '/dashboard' || path.startsWith('/dashboard/') || path.startsWith('/api/')) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
  }
  next();
}

void bootstrap();
