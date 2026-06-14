/**
 * Arcturus ingress — thin HTTP reverse proxy that holds the public ports.
 *
 * The API control plane and apps listener bind to dynamic internal ports (chosen
 * by scripts/api-swap.sh and written to data/api-upstream). This process reads
 * that state file on every request (mtime-cached: one statSync per request, full
 * read only when the file changes) and forwards to the currently active API colour.
 *
 * Two listeners:
 *   ARCTURUS_PORT      (default 7777)  → data/api-upstream "control" port
 *   ARCTURUS_APPS_PORT (default 7778)  → data/api-upstream "apps" port
 *
 * Forwarding is a hand-rolled `http.request` + native stream pipe — NOT
 * node-http-proxy. http-proxy shares one Agent/socket pool across every request,
 * and a long-lived SSE stream (build/runtime logs) left that shared state in a
 * way that TRUNCATED the body of a subsequent large upload (the deploy archive),
 * so the server's multipart parser waited forever and `arcturus deploy` hung on
 * big static sites. Native `req.pipe(proxyReq)` forwards the complete body with
 * correct backpressure, and each request is fully independent so one connection
 * can never corrupt another. A keep-alive agent keeps socket reuse efficient.
 *
 * Designed to restart rarely; the brief gap on its own restart is the only
 * remaining source of public-port downtime after blue-green API swaps.
 *
 * Run standalone: bun src/ingress.ts   (cwd: apps/api)
 */
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

// ── crash guards ──────────────────────────────────────────────────────────────
// The ingress is the public front door — it must NEVER exit on a stray error,
// or :7777/:7778 would briefly refuse connections (ERR_CONNECTION_REFUSED) while
// pm2 restarts it. Log and keep serving. (Bind errors are handled separately and
// DO exit, see handleBindError.)
process.on('uncaughtException', (err) => {
  console.error('[ingress] uncaughtException (ignored, staying up):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[ingress] unhandledRejection (ignored, staying up):', reason);
});

// ── config ────────────────────────────────────────────────────────────────────
const dataDir = path.resolve(process.env.ARCTURUS_DATA_DIR ?? './data');
const stateFile = path.join(dataDir, 'api-upstream');
const publicControlPort = Number.parseInt(process.env.ARCTURUS_PORT ?? '7777', 10);
const publicAppsPort = Number.parseInt(process.env.ARCTURUS_APPS_PORT ?? '7778', 10);

// One keep-alive agent for upstream forwarding: sockets are reused (no per-request
// connect churn) but every request still gets its own independent request/response
// cycle, so a streaming response can't wedge a later upload the way http-proxy did.
const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });

// Headers we must not forward verbatim — hop-by-hop, per RFC 7230 §6.1. The agent
// manages the upstream connection header itself.
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'proxy-authorization']);

// ── upstream cache (mtime-based, same pattern as DashboardUpstreamService) ───
interface Upstream {
  control: number;
  apps: number;
}
let cachedUpstream: Upstream | null = null;
let cachedMtime = 0;

/**
 * Returns the active upstream ports.
 * Hot path: one statSync per request; full read only when mtime changes.
 * fresh=true: bypass mtime check and re-read immediately (used by retry paths
 * after a transient error to pick up a concurrent flip).
 */
function readUpstream(opts?: { fresh?: boolean }): Upstream | null {
  try {
    const mtime = fs.statSync(stateFile).mtimeMs;
    if (!opts?.fresh && mtime === cachedMtime && cachedUpstream !== null) {
      return cachedUpstream;
    }
    const raw = fs.readFileSync(stateFile, 'utf8').trim();
    if (raw) {
      cachedUpstream = JSON.parse(raw) as Upstream;
      cachedMtime = mtime;
    }
  } catch {
    // State file absent or unreadable (e.g. between server:down and next swap).
    cachedUpstream = null;
    cachedMtime = 0;
  }
  return cachedUpstream;
}

// ── forwarding ────────────────────────────────────────────────────────────────
/**
 * Forwards one request to `target` (a loopback port) and pipes the response back.
 * Preserves the client's Host header (no changeOrigin) so the C1 Origin guard and
 * cookies see the real public host, and appends X-Forwarded-* the way http-proxy's
 * `xfwd:true` did (the API trusts these via ARCTURUS_TRUST_PROXY=loopback).
 *
 * The REQUEST body is buffered in full before forwarding. Why not pipe it straight
 * through? Piping propagates the upstream's backpressure back to the client, and the
 * deploy CLI (a bun-compiled binary) STALLS its streaming-fetch upload after ~2 MB
 * when it hits backpressure — so a large archive arrived truncated and the server's
 * multipart parser hung forever. Draining the client into memory first lets it send
 * at full speed (no backpressure, no stall); we then replay the complete body to the
 * API with an authoritative Content-Length. Uploads are already capped at
 * ARCTURUS_MAX_UPLOAD_MB, so the buffer is bounded. RESPONSES still stream (SSE log
 * tails are GETs with no request body, so they forward immediately and pipe live).
 */
function forward(req: http.IncomingMessage, res: http.ServerResponse, target: number): void {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(key)) headers[key] = value;
  }
  // xfwd (mirror node-http-proxy: append for/port/proto, set host once).
  const fwd: Record<string, string> = {
    for: req.socket.remoteAddress ?? '',
    port: String(req.socket.remotePort ?? ''),
    proto: 'http', // ingress listens on plain http; a TLS terminator in front sets its own
  };
  for (const key of ['for', 'port', 'proto'] as const) {
    const header = `x-forwarded-${key}`;
    const existing = headers[header];
    headers[header] = existing ? `${existing as string},${fwd[key]}` : fwd[key];
  }
  if (!headers['x-forwarded-host']) headers['x-forwarded-host'] = req.headers.host ?? '';

  const chunks: Buffer[] = [];
  let aborted = false;
  req.on('aborted', () => {
    aborted = true;
  });
  req.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
    }
  });
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    if (aborted) return;
    const body = Buffer.concat(chunks);
    // Authoritative framing: send exactly the bytes we received.
    delete headers['transfer-encoding'];
    if (body.length > 0) headers['content-length'] = String(body.length);
    else delete headers['content-length'];

    const proxyReq = http.request(
      { host: '127.0.0.1', port: target, path: req.url, method: req.method, headers, agent },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', (err) => {
      console.error('[ingress] upstream error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad gateway — API upstream unavailable');
      } else {
        res.destroy();
      }
    });
    // Tear the upstream request down if the client goes away (e.g. an SSE viewer
    // closes the tab) so we don't leak the streamed response connection.
    res.on('close', () => proxyReq.destroy());
    proxyReq.end(body);
  });
}

// ── retry config ─────────────────────────────────────────────────────────────
// Idempotent methods only — we probe the upstream port before piping the request,
// and only such requests are safe to delay. Same spirit as nginx proxy_next_upstream.
const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_RETRIES = 6; // ~1.5s total worst case (probe timeout + backoff per try)
const RETRY_DELAY_MS = 250;
const PROBE_TIMEOUT_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Probe whether a loopback port is accepting connections, without sending any
 * request data. Used to absorb the brief blue-green flip / pm2-restart window
 * BEFORE committing `req` to the forwarder (which pipes the stream exactly once).
 */
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

// ── handlers ──────────────────────────────────────────────────────────────────
function makeHandler(selector: (u: Upstream) => number) {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    let upstream = readUpstream();
    if (!upstream) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Service unavailable — API not yet started (data/api-upstream missing)');
      return;
    }
    let target = selector(upstream);

    // Idempotent requests can wait out a flip/restart: probe the port first, and
    // on failure re-read the state file (catches a concurrent flip) and retry the
    // probe. Only once the port accepts do we pipe req — exactly once.
    if (IDEMPOTENT.has(req.method?.toUpperCase() ?? '')) {
      for (
        let tries = MAX_RETRIES;
        tries > 0 && !(await probeConnect(target, PROBE_TIMEOUT_MS));
        tries--
      ) {
        await sleep(RETRY_DELAY_MS);
        upstream = readUpstream({ fresh: true });
        if (!upstream) {
          res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Service unavailable — API not yet started (data/api-upstream missing)');
          return;
        }
        target = selector(upstream);
      }
    }

    forward(req, res, target);
  };
}

const controlServer = http.createServer(makeHandler((u) => u.control));
const appsServer = http.createServer(makeHandler((u) => u.apps));

// ── WebSocket upgrade forwarding (future-proof; currently unused in production) ──
function makeUpgradeHandler(selector: (u: Upstream) => number) {
  return (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void => {
    const upstream = readUpstream();
    if (!upstream) {
      clientSocket.destroy();
      return;
    }
    const proxyReq = http.request({
      host: '127.0.0.1',
      port: selector(upstream),
      path: req.url,
      method: req.method,
      headers: req.headers,
    });
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      const lines = [`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}`];
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        for (const v of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${v}`);
      }
      clientSocket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (proxyHead?.length) proxySocket.unshift(proxyHead);
      if (head?.length) proxySocket.write(head);
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
      proxySocket.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => proxySocket.destroy());
    });
    proxyReq.on('error', () => clientSocket.destroy());
    proxyReq.end();
  };
}
controlServer.on(
  'upgrade',
  makeUpgradeHandler((u) => u.control),
);
appsServer.on(
  'upgrade',
  makeUpgradeHandler((u) => u.apps),
);

// ── startup ───────────────────────────────────────────────────────────────────
function handleBindError(err: NodeJS.ErrnoException, port: number, envVar: string): void {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[ingress] Port ${port} (${envVar}) is already in use. ` +
        'Stop the conflicting process or choose a different port.',
    );
    process.exit(1);
  }
  throw err;
}

controlServer.on('error', (err) =>
  handleBindError(err as NodeJS.ErrnoException, publicControlPort, 'ARCTURUS_PORT'),
);
appsServer.on('error', (err) =>
  handleBindError(err as NodeJS.ErrnoException, publicAppsPort, 'ARCTURUS_APPS_PORT'),
);

controlServer.listen(publicControlPort, '0.0.0.0', () => {
  console.log(`[ingress] control  :${publicControlPort} → ${stateFile} (.control)`);
});
appsServer.listen(publicAppsPort, '0.0.0.0', () => {
  console.log(`[ingress] apps     :${publicAppsPort} → ${stateFile} (.apps)`);
});

// ── graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(): void {
  controlServer.close();
  appsServer.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
