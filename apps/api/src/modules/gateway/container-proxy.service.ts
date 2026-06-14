import net from 'node:net';
import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import httpProxy from 'http-proxy';

export interface ProxyTarget {
  hostPort: number;
  /** When set, this prefix is stripped from the forwarded URL and announced via X-Forwarded-Prefix. */
  stripPrefix?: string;
  /** Full request path (middleware req.url is mount-relative). */
  fullPath: string;
}

// Idempotent methods are safe to delay behind a port probe (no request body to
// replay). Mirrors the ingress: probe the upstream port BEFORE piping req, never
// re-drive proxy.web on the same req (that re-pipes an ended stream → throw).
const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 250;
const PROBE_TIMEOUT_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Parse the port from an http://host:port origin; 0 if absent/unparseable. */
function portOf(origin: string): number {
  const m = origin.match(/:(\d+)\s*$/);
  return m?.[1] ? Number.parseInt(m[1], 10) : 0;
}

/** Probe whether a loopback port accepts connections, sending no request data. */
function probeConnect(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(timeoutMs, () => done(false));
  });
}

@Injectable()
export class ContainerProxyService {
  private readonly logger = new Logger(ContainerProxyService.name);
  // xfwd: announce the real client to the app (X-Forwarded-For/Host/Proto).
  private readonly proxy = httpProxy.createProxyServer({ xfwd: true });

  forward(req: Request, res: Response, target: ProxyTarget): void {
    stripForwardedHeaders(req);
    const query = req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
      : '';

    if (target.stripPrefix) {
      req.url = `${target.fullPath.slice(target.stripPrefix.length) || '/'}${query}`;
      req.headers['x-forwarded-prefix'] = target.stripPrefix;
    } else {
      req.url = `${target.fullPath}${query}`;
    }

    this.proxy.web(req, res, { target: `http://127.0.0.1:${target.hostPort}` }, (error) => {
      this.logger.warn(`proxy to :${target.hostPort} failed: ${error.message}`);
      if (!res.headersSent) {
        res.status(502).send('App is not responding — it may still be starting');
      }
    });
  }

  /**
   * Forwards to an arbitrary local origin (used for the dashboard's Next.js server).
   *
   * @param resolveOrigin - Re-resolved on each probe attempt to pick up a concurrent
   *   web blue-green flip (the swap writes the active colour's port to a state file).
   *
   * For idempotent requests we probe the upstream port (net.connect) before piping
   * req, retrying with a short back-off across the brief web-swap port-change window.
   * Only once the port accepts do we call proxy.web ONCE — req is piped exactly once,
   * so we never re-drive proxy.web on the same req (that re-pipes an ended stream and
   * throws). Non-idempotent requests proxy once directly.
   */
  async forwardToOrigin(
    req: Request,
    res: Response,
    resolveOrigin: () => string,
    fullPath: string,
  ): Promise<void> {
    stripForwardedHeaders(req);
    const query = req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
      : '';
    req.url = `${fullPath}${query}`;

    let origin = resolveOrigin();
    if (IDEMPOTENT.has(req.method?.toUpperCase() ?? '')) {
      const port = portOf(origin);
      if (port) {
        for (
          let tries = MAX_RETRIES;
          tries > 0 && !(await probeConnect(portOf(origin), PROBE_TIMEOUT_MS));
          tries--
        ) {
          await sleep(RETRY_DELAY_MS);
          origin = resolveOrigin();
        }
      }
    }

    this.proxy.web(req, res, { target: origin }, (error) => {
      this.logger.warn(`proxy to ${origin} failed: ${error.message}`);
      if (!res.headersSent) {
        res.status(502).send('Dashboard is not running');
      }
    });
  }
}

/**
 * Drops client-supplied X-Forwarded-* so apps can't be fed a spoofed client
 * IP/host — xfwd then re-adds the values this gateway actually observed.
 */
function stripForwardedHeaders(req: Request): void {
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-forwarded-host'];
  delete req.headers['x-forwarded-proto'];
  delete req.headers['x-forwarded-port'];
}
