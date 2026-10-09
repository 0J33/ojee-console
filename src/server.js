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
import { PrefsStore } from './notify/prefs.js';
import { NotifyCenter } from './notify/center.js';
import { PushStore, loadVapid, PUSH_HOSTS } from './notify/push.js';
import { WidgetKeys, WidgetData, widgetAuth } from './widgets.js';

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
const timeRef = new TimeReference({ historyFile: join(cfg.dataDir, 'time-history.json') });
const notifyPrefs = new PrefsStore({ file: join(cfg.dataDir, 'notifications.json') });
// Web Push: the VAPID pair is made once and kept in DATA_DIR (0600); only the
// public half ever reaches a page. PUSH_ALLOW_HOSTS (comma list) admits extra
// push hosts — for a local mock push service in tests, never in production.
const extraPushHosts = new Set(String(process.env.PUSH_ALLOW_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean));
const vapid = loadVapid(join(cfg.dataDir, 'vapid.json'));
const push = new PushStore({
  file: join(cfg.dataDir, 'push-subscriptions.json'),
  vapid,
  subject: process.env.PUSH_SUBJECT || (/^https:\/\//.test(cfg.publicOrigin || '') && !/localhost|127\.0\.0\.1/.test(cfg.publicOrigin) ? cfg.publicOrigin : 'https://ojee.net'),
  allowHost: (h) => PUSH_HOSTS.test(h) || extraPushHosts.has(h),
});
const notify = new NotifyCenter({
  registry,
  prefs: notifyPrefs,
  identitySecret: cfg.secrets.identitySecret,
  publicOrigin: cfg.publicOrigin,
  push,
});
if (process.env.NTP_PROBE !== 'off') timeRef.start();
// Phone widgets (src/widgets.js): their own keys, made on the Settings page.
const widgetKeys = new WidgetKeys({ file: join(cfg.dataDir, 'widget-keys.json') });
const widgetData = new WidgetData({ registry, identitySecret: cfg.secrets.identitySecret });

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
  '/ojee-ui2.css',
  '/calibre.css',
  '/app.css',
  '/chrome.js',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  // The manifest's own icons: "Add to Home Screen" can happen from the
  // login page, before any session exists.
  '/icon-192.png',
  '/icon-512.png',
]);
const PRE_AUTH_THEME = /^\/themes\/[a-z0-9-]+\.css$/;

/**
 * The service worker (Web Push). Pre-auth on purpose: a browser re-fetches it
 * to check for updates on its own schedule, often long after the session has
 * expired, and a 302 to /login there would leave an old worker in place for
 * good. It holds no secrets — it shows notifications and opens routes.
 */
app.get('/sw.js', (req, res) => {
  res.set({
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
    'Service-Worker-Allowed': '/',
  });
  res.sendFile(join(ROOT, 'public', 'sw.js'));
});

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

/* ── phone widgets: a widget key instead of a session ────────────────────── */
// Still behind the tailnet gate. The key opens these two routes and nothing
// else; it is not a session and never becomes one.
const requireWidgetKey = widgetAuth(widgetKeys);

app.get('/api/widget', requireWidgetKey, async (req, res) => {
  res.set('cache-control', 'no-store');
  try {
    res.json(await widgetData.get({ fresh: req.query.fresh === '1' }));
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e).slice(0, 200) });
  }
});

app.post('/api/widget/ac', requireWidgetKey, async (req, res) => {
  const p = req.body?.power;
  if (!(p === true || p === false || p === 'toggle')) return res.status(400).json({ error: 'power must be true, false or "toggle"' });
  const r = await widgetData.setAc(p);
  res.status(r.ok ? 200 : 502).json(r);
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

/** The last day of NTP measurements, for the watch's accuracy page. */
app.get('/api/time/history', requireAuth, (req, res) => {
  res.set('cache-control', 'no-store');
  res.json({ history: timeRef.history, everyMs: timeRef.everyMs, ntp: timeRef.status() });
});

app.get('/api/modules', requireAuth, (req, res) => {
  res.json({ modules: registry.publicList() });
});

app.post('/api/modules/refresh', requireAuth, async (req, res) => {
  res.json({ modules: await registry.refreshAll() });
});

/* ── notifications (see src/notify/center.js) ────────────────────────── */

/** Every open console listening for app notifications. */
const notifyClients = new Set();
notify.on('app', (ev) => {
  const frame = `event: notify\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const res of notifyClients) { try { res.write(frame); } catch { /* closed */ } }
});
notify.on('history', (rec) => {
  const frame = `event: history\ndata: ${JSON.stringify(rec)}\n\n`;
  for (const res of notifyClients) { try { res.write(frame); } catch { /* closed */ } }
});

const notifyView = () => ({
  catalogue: notify.catalogue(),
  prefs: notifyPrefs.publicView(),
  links: notify.linkStatus(),
  tz: notify.tz || null,
  clients: notifyClients.size,
  history: notify.history.slice(0, 30),
  push: { publicKey: push.publicKey, devices: push.devices() },
});

app.get('/api/notify', requireAuth, (req, res) => res.json(notifyView()));

app.put('/api/notify/prefs', requireAuth, (req, res) => {
  notifyPrefs.patch(req.body || {});
  notify.pushPrefs().catch(() => {});
  res.json(notifyView());
});

app.post('/api/notify/webhooks', requireAuth, (req, res) => {
  try {
    notifyPrefs.addWebhook(req.body || {});
    res.json(notifyView());
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.delete('/api/notify/webhooks/:id', requireAuth, (req, res) => {
  if (!notifyPrefs.removeWebhook(req.params.id)) return res.status(404).json({ error: 'No such webhook (ones from the environment are removed there).' });
  res.json(notifyView());
});

app.post('/api/notify/test', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (b.channel === 'app') {
    const r = await notify.testApp(notifyClients.size);
    return res.json({ ok: true, clients: notifyClients.size, push: r.push ? { sent: r.push.sent, failed: r.push.failed, gone: r.push.gone } : null });
  }
  if (b.channel === 'discord' && b.module) return res.json(await notify.testModule(String(b.module), 'discord'));
  if (b.channel === 'discord') {
    const r = await notify.testDiscord(String(b.webhook || ''));
    return res.status(r.ok ? 200 : 502).json(r);
  }
  res.status(400).json({ error: 'channel must be app or discord' });
});

/* Web Push devices (src/notify/push.js). */
app.get('/api/notify/push', requireAuth, (req, res) => {
  res.set('cache-control', 'no-store');
  res.json({ publicKey: push.publicKey, devices: push.devices() });
});

app.post('/api/notify/push/subscribe', requireAuth, (req, res) => {
  try {
    const b = req.body || {};
    const rec = push.add(b.subscription, { label: b.label, ua: req.get('user-agent') || '', replaces: b.replaces || null });
    res.json({ ok: true, id: rec.id, ...notifyView() });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.patch('/api/notify/push/:id', requireAuth, (req, res) => {
  if (!push.rename(req.params.id, req.body?.label)) return res.status(404).json({ error: 'No such device' });
  res.json(notifyView());
});

app.delete('/api/notify/push/:id', requireAuth, (req, res) => {
  if (!push.remove(req.params.id)) return res.status(404).json({ error: 'No such device' });
  res.json(notifyView());
});

app.post('/api/notify/push/:id/test', requireAuth, async (req, res) => {
  const r = await notify.testPush(req.params.id);
  res.status(r.ok ? 200 : r.error === 'No such device' ? 404 : 502).json({ ...r, ...notifyView() });
});

/**
 * App notifications, to every open console. A client that reconnects (the
 * phone app coming back from the background) passes `since` and gets what it
 * missed from the last two hours, at most five.
 */
app.get('/api/notify/stream', requireAuth, (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.socket?.setNoDelay(true);
  res.write(': connected\n\n');
  const since = Number(req.query.since);
  if (since > 0) for (const ev of notify.missedSince(since)) res.write(`event: notify\ndata: ${JSON.stringify({ ...ev, missed: true })}\n\n`);
  notifyClients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closed */ } }, 25_000);
  res.on('close', () => { clearInterval(ping); notifyClients.delete(res); });
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

/* Widget keys, managed from Settings. The key itself is returned once. */
app.get('/api/widget-keys', requireAuth, (req, res) => res.json({ keys: widgetKeys.list() }));

app.post('/api/widget-keys', requireAuth, (req, res) => {
  const k = widgetKeys.create(req.body?.label);
  res.json({ ok: true, ...k, keys: widgetKeys.list() });
});

app.delete('/api/widget-keys/:id', requireAuth, (req, res) => {
  if (!widgetKeys.remove(req.params.id)) return res.status(404).json({ error: 'No such key' });
  res.json({ ok: true, keys: widgetKeys.list() });
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
if (process.env.NOTIFY !== 'off') notify.start();

server.listen(cfg.port, cfg.host, () => {
  console.log(`ojee-console on http://${cfg.host}:${cfg.port}`);
  console.log(`  branding      ${cfg.branding.name}${cfg.branding.theme ? ` (theme: ${cfg.branding.theme})` : ''}`);
  console.log(`  session       ${cfg.auth.sessionHours}h · device trust ${cfg.auth.trustDays}d`);
  console.log(`  secure cookies ${cfg.isHttps ? 'yes' : 'NO — set PUBLIC_ORIGIN to an https:// URL in production'}`);
  if (cfg.auth.allowLoopback) console.log('  ALLOW_LOOPBACK is on — development only.');
  for (const m of registry.list()) {
    console.log(`  module ${m.id.padEnd(10)} ${m.enabled ? m.origin || '(no origin)' : '(disabled)'}`);
  }
  // Names only — a webhook URL is a credential and never goes in a log.
  const hooks = notifyPrefs.webhooks();
  console.log(`  web push      ${push.count()} device${push.count() === 1 ? '' : 's'}${vapid.created ? ' · new VAPID key pair made' : ''}`);
  console.log(`  notifications ${hooks.length ? `Discord via ${hooks.map((w) => w.id).join(', ')}` : 'no Discord webhook'} · quiet ${notifyPrefs.get().quiet.on ? `${notifyPrefs.get().quiet.from}–${notifyPrefs.get().quiet.to}` : 'off'} · tz ${notify.tz || 'system'}`);
});

const shutdown = () => {
  registry.stop();
  notify.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server, registry, devices, sessions, totp, cfg };
