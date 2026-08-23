/**
 * The module proxy.
 *
 * Forwards `/{moduleId}/*` to the module's origin, carrying the identity the
 * console already established. Hand-rolled on node:http rather than pulled
 * from http-proxy-middleware, because the two things this proxy must get right
 * are exactly the two things a generic proxy tends to get wrong:
 *
 *   1. Server-Sent Events. The home hub streams live device state over SSE,
 *      and any buffering turns "live" into "frozen for thirty seconds". We
 *      disable Nagle, flush headers immediately, and pipe without transforms.
 *      (The stack's Caddyfile already carries the matching `flush_interval -1`
 *      for the same reason — that lesson is written down in its comments.)
 *
 *   2. Header hygiene. The module trusts `X-Console-*` completely, so the
 *      proxy MUST strip any the client sent before adding its own. Without
 *      that strip, anyone who can reach the console unauthenticated — or any
 *      module that can reach a sibling — could assert whatever identity they
 *      liked. This is the single most important function in the file.
 */

import http from 'node:http';
import https from 'node:https';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Headers the console asserts and the module trusts. Every one of these is
 * deleted from the inbound request before we set it.
 */
const IDENTITY_HEADERS = [
  'x-console-user',
  'x-console-display',
  'x-console-node',
  'x-console-module',
  'x-console-auth',
  'x-console-ts',
];

/** Hop-by-hop headers that must not be forwarded (RFC 9110 §7.6.1). */
const HOP_BY_HOP = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
];

/**
 * Sign the identity so a module can verify the headers really came from the
 * console and not from something else that reached its port directly. A module
 * on a shared docker network is not otherwise protected from its siblings.
 *
 * The timestamp is inside the signature, so a captured header set cannot be
 * replayed indefinitely — modules should reject a skew beyond a minute or two.
 */
export function signIdentity({ user, moduleId, ts, secret }) {
  return createHmac('sha256', secret)
    .update(`${user}\n${moduleId}\n${ts}`)
    .digest('base64url');
}

/** Verify helper, exported so modules can share exactly this implementation. */
export function verifyIdentity({ user, moduleId, ts, signature, secret, maxSkewMs = 120_000 }) {
  if (!user || !moduleId || !ts || !signature) return false;
  const when = Number(ts);
  if (!Number.isFinite(when) || Math.abs(Date.now() - when) > maxSkewMs) return false;

  const want = Buffer.from(signIdentity({ user, moduleId, ts, secret }));
  const got = Buffer.from(String(signature));
  // timingSafeEqual throws on a length mismatch, so check length first —
  // the length of an HMAC is not a secret.
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * @param {object} opts
 * @param {ModuleRegistry} opts.registry
 * @param {string} opts.identitySecret  shared secret for X-Console-Auth
 */
export function createModuleProxy({ registry, identitySecret }) {
  return function moduleProxy(req, res, next) {
    // `/home/api/state` -> id "home", rest "/api/state"
    const m = /^\/([a-z][a-z0-9-]{0,31})(\/.*)?$/.exec(req.url);
    if (!m) return next();

    const mod = registry.get(m[1]);
    if (!mod) return next();

    if (!mod.enabled) {
      return res.status(404).json({ error: 'module_disabled', module: mod.id });
    }
    if (!mod.origin) {
      return res.status(503).json({ error: 'module_misconfigured', module: mod.id, detail: mod.reason });
    }

    const target = new URL((m[2] || '/'), mod.origin);
    const client = target.protocol === 'https:' ? https : http;

    // ── build the outbound headers ──────────────────────────────────────
    const headers = { ...req.headers };
    // 1. Strip anything the client tried to assert. Non-negotiable.
    for (const h of IDENTITY_HEADERS) delete headers[h];
    for (const h of HOP_BY_HOP) delete headers[h];
    // 2. Never forward the console's own cookies. The module has no business
    //    seeing the session or device-trust tokens, and a module that started
    //    honouring them would quietly become a second auth surface.
    delete headers.cookie;
    // 3. Strip any Authorization the CLIENT sent, then attach the console's
    //    own upstream credential if this module has one. Order matters: a
    //    browser must never be able to choose what the module sees here.
    delete headers.authorization;
    if (mod.token) headers.authorization = `Bearer ${mod.token}`;
    // 4. Assert who this is.
    const ts = String(Date.now());
    const user = req.session?.user || req.peer?.login || 'unknown';
    headers['x-console-user'] = user;
    headers['x-console-display'] = req.peer?.display || '';
    headers['x-console-node'] = req.peer?.node || '';
    headers['x-console-module'] = mod.id;
    headers['x-console-ts'] = ts;
    headers['x-console-auth'] = signIdentity({ user, moduleId: mod.id, ts, secret: identitySecret });
    // 5. Standard forwarding context.
    headers.host = target.host;
    headers['x-forwarded-proto'] = req.protocol;
    headers['x-forwarded-host'] = req.get('host') || '';
    headers['x-forwarded-prefix'] = `/${mod.id}`;
    // 6. SSE must not be compressed. `encode gzip` holds frames until its
    //    window fills, which stalls a stream for tens of seconds.
    if (String(req.headers.accept || '').includes('text/event-stream')) {
      headers['accept-encoding'] = 'identity';
    }

    const upstream = client.request(
      { protocol: target.protocol, hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers },
      (up) => {
        res.status(up.statusCode || 502);
        for (const [k, v] of Object.entries(up.headers)) {
          if (HOP_BY_HOP.includes(k.toLowerCase())) continue;
          res.setHeader(k, v);
        }
        // Flush the head before any body arrives so an SSE client sees the
        // stream open immediately rather than after the first event.
        res.flushHeaders?.();
        res.socket?.setNoDelay?.(true);
        up.pipe(res);
      },
    );

    upstream.on('error', (e) => {
      // Mark it unreachable so the nav reflects reality on the next poll
      // rather than waiting for the timer to notice.
      mod.status = 'unreachable';
      mod.reason = `${mod.origin} — ${e.code || e.message}`;
      if (res.headersSent) return res.destroy();
      res.status(502).json({ error: 'module_unreachable', module: mod.id, detail: e.code || e.message });
    });

    // Abort upstream if the client hangs up — otherwise a closed SSE tab
    // leaves the module streaming into a dead socket forever.
    res.on('close', () => { if (!upstream.destroyed) upstream.destroy(); });

    // Belt and braces: if anything upstream of here already consumed the
    // stream, re-serialise what it parsed rather than sending an empty body.
    // A silently empty write is far worse than a slightly redundant check.
    if (req.readableEnded || req._body) {
      if (req.body !== undefined && req.body !== null) {
        const raw = Buffer.isBuffer(req.body) || typeof req.body === 'string'
          ? req.body : JSON.stringify(req.body);
        upstream.setHeader?.('content-length', Buffer.byteLength(raw));
        upstream.write(raw);
      }
      upstream.end();
    } else {
      req.pipe(upstream);
    }
  };
}

/**
 * WebSocket upgrades. Express middleware never sees these — they arrive on the
 * server's `upgrade` event with a raw socket — so the routing and the header
 * hygiene have to be repeated here. Keeping them in the same file as the HTTP
 * proxy is deliberate: the failure mode when these two drift is an
 * unauthenticated upgrade endpoint.
 *
 * @returns {boolean} true if this upgrade was claimed by a module
 */
export function proxyUpgrade({ registry, identitySecret, req, socket, head, peer, session }) {
  const url = new URL(req.url, 'http://placeholder');
  const m = /^\/([a-z][a-z0-9-]{0,31})(\/.*)?$/.exec(url.pathname);
  if (!m) return false;

  const mod = registry.get(m[1]);
  if (!mod || !mod.enabled || !mod.origin) return false;

  const target = new URL((m[2] || '/') + url.search, mod.origin);
  const client = target.protocol === 'https:' ? https : http;

  const headers = { ...req.headers };
  for (const h of IDENTITY_HEADERS) delete headers[h];
  delete headers.cookie;
  // Same two rules as the HTTP path, and they were missing here: an upgrade
  // is a request like any other. Without the token the WebSocket to a guarded
  // module is rejected — which is what "the remote desktop will not connect"
  // looked like — and without the delete, a browser could pick what the
  // module sees by sending its own Authorization on the upgrade.
  delete headers.authorization;
  if (mod.token) headers.authorization = `Bearer ${mod.token}`;
  const ts = String(Date.now());
  const user = session?.user || peer?.login || 'unknown';
  headers['x-console-user'] = user;
  headers['x-console-module'] = mod.id;
  headers['x-console-ts'] = ts;
  headers['x-console-auth'] = signIdentity({ user, moduleId: mod.id, ts, secret: identitySecret });
  headers.host = target.host;

  const upstream = client.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: 'GET',
    headers,
  });

  upstream.on('upgrade', (upRes, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}`];
    for (const [k, v] of Object.entries(upRes.headers)) {
      for (const one of [].concat(v)) lines.push(`${k}: ${one}`);
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n');

    // Binary framing on both legs; latency matters more than packing for a
    // remote-desktop stream, which is the main user of this path.
    upSocket.setNoDelay(true);
    socket.setNoDelay(true);
    if (upHead?.length) socket.write(upHead);
    if (head?.length) upSocket.write(head);

    upSocket.pipe(socket).pipe(upSocket);

    const kill = () => { upSocket.destroy(); socket.destroy(); };
    upSocket.on('error', kill);
    socket.on('error', kill);
    upSocket.on('close', kill);
    socket.on('close', kill);
  });

  // The module answered the upgrade with an ordinary response — it refused.
  // Pass the refusal through rather than leaving the client hanging.
  upstream.on('response', (upRes) => {
    socket.write(`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n\r\n`);
    socket.destroy();
  });

  upstream.on('error', () => {
    socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    socket.destroy();
  });

  upstream.end();
  return true;
}

export const _internals = { IDENTITY_HEADERS, HOP_BY_HOP };
