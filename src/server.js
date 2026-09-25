/**
 * ojee-console — the shell.
 *
 * Owns exactly four things and delegates everything else to modules:
 *   1. Auth   — tailnet gate, TOTP, 30-day device trust
 *   2. Chrome — the app shell, nav, theming, branding
 *   3. Routing— /{module}/* proxied with an asserted identity
 *   4. Registry — which modules exist, and whether they are actually up
 *
 * Request order is load-bearing:
 *
 *   tailnetGate  →  attachSession  →  requireAuth  →  moduleProxy
 *        │                │                │              │
 *   404 if not      decode cookies    redeem device   assert identity
 *   on the tailnet   (never trust)    trust or 401
 *
 * The gate runs FIRST, before any body is parsed and before the login page
 * exists as a concept. Nothing off the tailnet ever learns this is a login
 * surface.
 */

import express from 'express';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

import { loadConfig, ROOT } from './config.js';
import { tailnetGate, peerAddress } from './auth/tailscale.js';
import { TotpVerifier } from './auth/totp.js';
import { DeviceStore } from './auth/devices.js';
import { SessionCodec, parseCookies, cookieHeader } from './auth/session.js';
import { ModuleRegistry } from './modules/registry.js';
import { createModuleProxy, proxyUpgrade } from './modules/proxy.js';
import { TimeReference } from './time.js';

const cfg = loadConfig();

mkdirSync(cfg.dataDir, { recursive: true });

const SESSION_COOKIE = 'ojc_s';
const DEVICE_COOKIE = 'ojc_d';

const sessions = new SessionCodec({
  keys: cfg.secrets.sessionKeys,
  ttlMs: cfg.auth.sessionHours * 60 * 60 * 1000,
});
const totp = new TotpVerifier({
  secret: cfg.secrets.totpSecret,
  maxFailures: cfg.auth.maxFailures,
});
const devices = new DeviceStore({
  file: join(cfg.dataDir, 'devices.json'),
  trustDays: cfg.auth.trustDays,
});
const registry = new ModuleRegistry({ configured: cfg.modules });
// Measures this host's offset from UTC over NTP, so the home page's clock can
// state its own accuracy instead of assuming it. Off in tests (no network).
const timeRef = new TimeReference();
if (process.env.NTP_PROBE !== 'off') timeRef.start();

const app = express();
app.disable('x-powered-by');
// We are behind Caddy in production. Only one hop — trusting the whole chain
// would let a client forge X-Forwarded-For and, with it, anything derived
// from the client address.
const TRUST_PROXY_HOPS = 1;
app.set('trust proxy', TRUST_PROXY_HOPS);

/**
 * Liveness, BEFORE the tailnet gate.
 *
 * The container healthcheck runs inside the container and reaches the app on
 * 127.0.0.1. The gate correctly refuses loopback in production, so a probe
 * pointed at the gated /api/health could never pass and the container sat
 * permanently unhealthy — which makes `depends_on: service_healthy` unusable
 * and makes a working deployment look broken.
 *
 * Deliberately says nothing: whether the process is up is not a secret, and
 * the detailed /api/health stays behind all three gates.
 */
app.get('/healthz', (req, res) => res.json({ ok: true }));

/* ── gate 1: the tailnet ────────────────────────────────────────────────── */
app.use(tailnetGate({
  trustedCidrs: cfg.auth.trustedCidrs,
  trustProxyIdentity: cfg.auth.trustProxyIdentity,
  allowLoopback: cfg.auth.allowLoopback,
  cliPath: cfg.auth.tailscaleCli,
}));

// JSON-parse the CONSOLE's own routes only.
//
// express.json() consumes the request stream. Applied globally it also drained
// every request destined for a MODULE, and the proxy then piped a stream that
// had nothing left in it — so modules received an empty body. Reads worked and
// every write silently did nothing, which is what "home can only read" was.
//
// Module traffic is /{moduleId}/..., the console's own is /api/..., so the
// split is exact rather than a guess.
const parseJson = express.json({ limit: '64kb' });
app.use((req, res, next) => (
  req.path.startsWith('/api/') ? parseJson(req, res, next) : next()
));

/* ── cookies + session ──────────────────────────────────────────────────── */
const setCookie = (res, name, value, maxAgeMs) =>
  res.append('Set-Cookie', cookieHeader(name, value, { maxAgeMs, secure: cfg.isHttps }));

function issueSession(res, peer, via, deviceId = null) {
  const value = sessions.issue({
    // Stamped so revoke-all can invalidate sessions that name no device.
    epoch: devices.epoch,
    user: peer?.login || 'unknown',
    display: peer?.display || '',
    node: peer?.node || '',
    nodeId: peer?.nodeId || '',
    via,
    // Present only on the device-trust path. Its presence is what lets
    // revoking a device kill the sessions it minted — see sessionStillValid.
    ...(deviceId ? { deviceId } : {}),
  });
  setCookie(res, SESSION_COOKIE, value, cfg.auth.sessionHours * 60 * 60 * 1000);
}

/**
 * Sessions are stateless signed cookies, which means there is normally nothing
 * to invalidate server-side. That is fine for the TOTP path but leaves a real
 * hole on the device path: revoking a trusted device — including the automatic
 * revocation when a cloned cookie is detected — would stop future logins while
 * leaving any session it had already minted alive for up to SESSION_HOURS.
 *
 * So a device-minted session carries its deviceId, and we check the device
 * still exists. One map lookup, and revocation becomes immediate. Sessions
 * minted by TOTP carry no deviceId and are deliberately unaffected — they are
 * not tied to a device in the first place.
 */
function sessionStillValid(session, peer) {
  // A session must still belong to the peer presenting it, or a cookie copied
  // to another tailnet machine would keep working until it expired.
  if (session.user && peer?.login && session.user !== peer.login) return false;
  if (session.deviceId && !devices.exists(session.deviceId)) return false;
  // Issued before the last revoke-all. This is what reaches the sessions that
  // carry no deviceId — without it, "revoke all" left them running.
  if ((session.epoch ?? 0) !== devices.epoch) return false;
  return true;
}

app.use((req, res, next) => {
  req.cookies = parseCookies(req.headers.cookie);
  const v = sessions.verify(req.cookies[SESSION_COOKIE]);
  if (v.ok && sessionStillValid(v.session, req.peer)) {
    req.session = v.session;
  } else if (v.ok) {
    // Signed and unexpired but no longer legitimate. Clear it so the browser
    // stops sending a cookie that will never be accepted again.
    setCookie(res, SESSION_COOKIE, '', 0);
  }
  next();
});

/* ── gate 3: device trust (attempted before demanding TOTP) ─────────────── */
function tryDeviceTrust(req, res) {
  if (req.session) return true;
  const raw = req.cookies?.[DEVICE_COOKIE];
  if (!raw) return false;

  const r = devices.redeem(raw, req.peer);
  if (!r.ok) {
    // Clear a cookie that can never work again, so the browser stops
    // presenting it and the user is not stuck in a silent retry loop.
    if (['unknown', 'expired', 'stale_token', 'malformed'].includes(r.reason)) {
      setCookie(res, DEVICE_COOKIE, '', 0);
    }
    req.deviceTrustFailure = r.reason;
    return false;
  }

  setCookie(res, DEVICE_COOKIE, r.cookie, cfg.auth.trustDays * 24 * 60 * 60 * 1000);
  issueSession(res, req.peer, 'device-trust', r.device.id);
  req.session = { user: req.peer?.login, via: 'device-trust', deviceId: r.device.id };
  return true;
}

/**
 * Only a document NAVIGATION should be redirected to the login page. An API
 * call must get a JSON 401 so the caller can react — a redirect turns
 * `fetch('/api/...')` into a 200 with an HTML body, which every client then
 * misparses.
 *
 * `req.accepts('html')` is not the test: a wildcard Accept header (curl, most
 * fetch calls, every module-to-module request) matches it and gets redirected.
 * A real navigation sends `Sec-Fetch-Mode: navigate`, or failing that names
 * text/html explicitly.
 */
function wantsHtmlPage(req) {
  if (req.path.startsWith('/api/')) return false;
  const mode = req.get('sec-fetch-mode');
  if (mode) return mode === 'navigate';
  return String(req.get('accept') || '').includes('text/html');
}

function requireAuth(req, res, next) {
  if (tryDeviceTrust(req, res)) return next();
  if (wantsHtmlPage(req)) return res.redirect('/login');
  return res.status(401).json({
    error: 'unauthorized',
    // Useful when a device cookie stopped working and it is not obvious why.
    reason: req.deviceTrustFailure || 'no_session',
  });
}

/* ── public-within-the-tailnet routes ───────────────────────────────────── */

app.get('/login', (req, res) => {
  if (tryDeviceTrust(req, res)) return res.redirect('/');
  res.sendFile(join(ROOT, 'public', 'login.html'));
});

/** Branding is needed to render the login page, so it sits before requireAuth. */
app.get('/api/branding', (req, res) => {
  res.json({ ...cfg.branding, peer: req.peer?.display || req.peer?.login || null });
});

app.post('/api/login', (req, res) => {
  // Bucket by tailnet identity, not IP: one user moving between wifi and
  // cellular is one bucket, and every bucket is already an authenticated peer.
  const bucket = req.peer?.login || req.ip || 'unknown';
  const r = totp.verify(req.body?.code, bucket);

  if (!r.ok) {
    const status = r.reason === 'rate_limited' ? 429 : 401;
    if (r.retryAfterMs) res.set('Retry-After', String(Math.ceil(r.retryAfterMs / 1000)));
    // The reason is safe to return: the caller is already an authenticated
    // tailnet peer, and "you replayed a code" is genuinely useful to them.
    return res.status(status).json({ error: r.reason });
  }

  // Enrol the device FIRST, then bind the session to it.
  //
  // The session used to be issued before the device existed, so the one minted
  // at enrolment carried no deviceId — and sessionStillValid only revokes
  // sessions that name a device. Revoking that device therefore killed every
  // future redemption while leaving the browser that enrolled it logged in for
  // the rest of the session's life. Revocation that does not log out the
  // device you just revoked is not revocation.
  if (req.body?.trustDevice) {
    const { cookie, device } = devices.issue({
      peer: req.peer,
      label: req.body?.deviceLabel,
      userAgent: req.get('user-agent') || '',
    });
    setCookie(res, DEVICE_COOKIE, cookie, cfg.auth.trustDays * 24 * 60 * 60 * 1000);
    issueSession(res, req.peer, 'totp', device.id);
    return res.json({ ok: true, trusted: true, device, trustDays: cfg.auth.trustDays });
  }

  issueSession(res, req.peer, 'totp');
  res.json({ ok: true, trusted: false });
});

/**
 * Assets the login page needs before a session exists.
 *
 * An exact allowlist served by path, NOT express.static(). express.static()
 * takes a DIRECTORY root — pointing it at a single file silently matches
 * nothing, every stylesheet falls through to requireAuth, and the login page
 * renders as unstyled HTML. That is exactly what an earlier version of this
 * file did, and it is invisible from inside the app because everything is
 * styled correctly once you are authenticated.
 *
 * Kept to a fixed set rather than opening the directory: an unauthenticated
 * caller should be able to fetch the chrome the login form needs and nothing
 * else. Both branches are exact-match or tightly patterned, so neither can be
 * walked out of `public/`.
 */
const PRE_AUTH_ASSETS = new Set([
  '/ojee-ui.css',
  '/calibre.css',
  '/app.css',
  '/chrome.js',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
]);
const PRE_AUTH_THEME = /^\/themes\/[a-z0-9-]+\.css$/;

app.get('*', (req, res, next) => {
  if (!PRE_AUTH_ASSETS.has(req.path) && !PRE_AUTH_THEME.test(req.path)) return next();
  if (/\.(js|css)$/i.test(req.path)) res.setHeader('Cache-Control', 'no-store');
  res.sendFile(join(ROOT, 'public', req.path), (err) => { if (err) next(); });
});

app.post('/api/logout', (req, res) => {
  setCookie(res, SESSION_COOKIE, '', 0);
  // Logout ends the SESSION but keeps the device trusted — that is the whole
  // point of trusting a device. "Forget this device" is a separate, explicit
  // action on the Devices screen.
  res.json({ ok: true });
});

/* ── authenticated routes ───────────────────────────────────────────────── */

app.get('/api/session', requireAuth, (req, res) => {
  res.json({
    user: req.session.user,
    via: req.session.via,
    peer: req.peer,
    expiresAt: req.session.exp || null,
    trustDays: cfg.auth.trustDays,
  });
});

/**
 * The reference time, for the home page's clock.
 *
 * The browser treats this like an NTP server of its own: it notes when it asked
 * and when the answer arrived, assumes the reply was generated halfway, and
 * keeps the sample with the shortest round trip. `ntp` is this server's own
 * measurement against an NTP server, so the page can say how far it trusts it.
 * Never cached — a cached timestamp is a wrong one.
 */
app.get('/api/time', requireAuth, (req, res) => {
  res.set('cache-control', 'no-store');
  res.json({ t: timeRef.now(), ntp: timeRef.status() });
});

app.get('/api/modules', requireAuth, (req, res) => {
  res.json({ modules: registry.publicList() });
});

app.post('/api/modules/refresh', requireAuth, async (req, res) => {
  res.json({ modules: await registry.refreshAll() });
});

app.get('/api/devices', requireAuth, (req, res) => {
  res.json({
    devices: devices.list(),
    current: req.session.deviceId || null,
    trustDays: cfg.auth.trustDays,
  });
});

app.delete('/api/devices/:id', requireAuth, (req, res) => {
  const removed = devices.revoke(req.params.id);
  if (!removed) return res.status(404).json({ error: 'unknown_device' });
  // Revoking the device you are currently on should also drop its cookie,
  // otherwise the browser keeps presenting a token that no longer exists and
  // the next load looks like a mysterious logout rather than the thing you
  // just asked for.
  if (req.session.deviceId === req.params.id) setCookie(res, DEVICE_COOKIE, '', 0);
  res.json({ ok: true });
});

app.post('/api/devices/revoke-all', requireAuth, (req, res) => {
  const n = devices.revokeAll();
  setCookie(res, DEVICE_COOKIE, '', 0);
  setCookie(res, SESSION_COOKIE, '', 0);
  res.json({ ok: true, revoked: n });
});

app.get('/api/health', (req, res) => {
  const mods = registry.publicList();
  res.json({
    ok: true,
    version: process.env.npm_package_version || '1.0.0',
    modules: mods.map((m) => ({ id: m.id, status: m.status })),
    ready: mods.filter((m) => m.status === 'ready').length,
    total: mods.filter((m) => m.enabled).length,
  });
});

/* ── module proxy ───────────────────────────────────────────────────────── */
// After requireAuth, so a module never receives an unauthenticated request.
app.use(requireAuth, createModuleProxy({ registry, identitySecret: cfg.secrets.identitySecret }));

/* ── shell ──────────────────────────────────────────────────────────────── */
// Everything not in the pre-auth allowlist above sits behind requireAuth, so
// an unauthenticated peer cannot enumerate the app.
/* The shell's own code is never cached.

   Everything here is served with an ETag and `max-age=0`, which is correct
   and which is not enough: a tab left open for an afternoon never re-fetches
   anything, because moving between screens in this app changes a hash and
   nothing else. A deploy then lands on a machine that goes on running the
   build it loaded at breakfast, and the only symptom is that a fix you can
   see in the file does not appear on the screen.

   A module's UI already carries `?v=<version>`; the shell could not, because
   its own modules import each other by bare path and a query string does not
   travel down an import graph. `no-store` does, and on a private console
   reached over a tailnet the few hundred kilobytes it re-fetches cost less
   than one stale afternoon. Fonts, icons and images are left alone. */
app.use(requireAuth, express.static(join(ROOT, 'public'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-store');
  },
}));
app.get('*', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(join(ROOT, 'public', 'index.html'));
});

/* ── server + upgrades ──────────────────────────────────────────────────── */
const server = createServer(app);

server.on('upgrade', async (req, socket, head) => {
  const deny = (code, msg) => {
    socket.write(`HTTP/1.1 ${code} ${msg}\r\n\r\n`);
    socket.destroy();
  };

  // Express middleware does not run for upgrades, so both gates are repeated
  // here by hand. This is the endpoint most likely to be left open by
  // accident, and the remote-desktop module depends on it.
  const gate = tailnetGate({
    trustedCidrs: cfg.auth.trustedCidrs,
    trustProxyIdentity: cfg.auth.trustProxyIdentity,
    allowLoopback: cfg.auth.allowLoopback,
    cliPath: cfg.auth.tailscaleCli,
  });
  const fakeRes = {
    status() { return this; },
    type() { return this; },
    send() { deny(404, 'Not Found'); },
  };
  let passed = false;
  req.get = (h) => req.headers[String(h).toLowerCase()];
    // Give the gate the same address Express would have computed for a normal
    // request. Without it the gate sees the reverse proxy and refuses everyone.
    req.ip = peerAddress(req, TRUST_PROXY_HOPS);
  await gate(req, fakeRes, () => { passed = true; });
  if (!passed) return;

  const cookies = parseCookies(req.headers.cookie);
  const v = sessions.verify(cookies[SESSION_COOKIE]);
  if (!v.ok || (v.session.user && req.peer?.login && v.session.user !== req.peer.login)) {
    return deny(401, 'Unauthorized');
  }

  const claimed = proxyUpgrade({
    registry,
    identitySecret: cfg.secrets.identitySecret,
    req, socket, head,
    peer: req.peer,
    session: v.session,
  });
  if (!claimed) deny(404, 'Not Found');
});

registry.start();

server.listen(cfg.port, cfg.host, () => {
  console.log(`ojee-console on http://${cfg.host}:${cfg.port}`);
  console.log(`  branding      ${cfg.branding.name}${cfg.branding.theme ? ` (theme: ${cfg.branding.theme})` : ''}`);
  console.log(`  session       ${cfg.auth.sessionHours}h · device trust ${cfg.auth.trustDays}d`);
  console.log(`  secure cookies ${cfg.isHttps ? 'yes' : 'NO — set PUBLIC_ORIGIN to an https:// URL in production'}`);
  if (cfg.auth.allowLoopback) console.log('  ALLOW_LOOPBACK is on — development only.');
  for (const m of registry.list()) {
    console.log(`  module ${m.id.padEnd(10)} ${m.enabled ? m.origin || '(no origin)' : '(disabled)'}`);
  }
});

const shutdown = () => {
  registry.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server, registry, devices, sessions, totp, cfg };
