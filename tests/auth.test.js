/**
 * Auth unit tests — node:test, no dependencies.
 *
 *   node --test tests/
 *
 * These cover the properties that are easy to *claim* and hard to notice
 * losing: replay rejection, token rotation, peer binding, fail-closed
 * behaviour, and a registry that degrades rather than hides.
 */

import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TotpVerifier, _resetTotpState, authenticator } from '../src/auth/totp.js';
import { DeviceStore } from '../src/auth/devices.js';
import { SessionCodec, parseCookies, cookieHeader } from '../src/auth/session.js';
import { tailnetGate, normalizeAddr, peerAddress, _internals as tsInternals } from '../src/auth/tailscale.js';
import { ModuleRegistry, validateManifest } from '../src/modules/registry.js';
import { signIdentity, verifyIdentity } from '../src/modules/proxy.js';

const TMP = mkdtempSync(join(tmpdir(), 'ojee-console-test-'));
after(() => rmSync(TMP, { recursive: true, force: true }));

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const KEY = 'k'.repeat(48);

/* ══ TOTP ═══════════════════════════════════════════════════════════════ */

describe('TOTP', () => {
  beforeEach(() => _resetTotpState());

  test('accepts a current code', () => {
    const v = new TotpVerifier({ secret: SECRET });
    assert.deepEqual(v.verify(authenticator.generate(SECRET), 'u'), { ok: true });
  });

  test('rejects a replay of the same code', () => {
    const v = new TotpVerifier({ secret: SECRET });
    const code = authenticator.generate(SECRET);
    assert.equal(v.verify(code, 'u').ok, true);

    const second = v.verify(code, 'u');
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'replayed');
  });

  test('a code at the far edge of the window is still replay-guarded', () => {
    // The guard keys on the MATCHED timestep, found by re-deriving each step
    // in range. If that scan is narrower than the range otplib accepts, an
    // edge code yields no key and can be replayed for the rest of its
    // validity. TOTP_WINDOW made the range configurable, so this pins the
    // two together.
    const step = 30_000;
    for (const delta of [-1, 1]) {
      _resetTotpState();
      const v = new TotpVerifier({ secret: SECRET });
      const code = authenticator.generate(SECRET, new Date(Date.now() + delta * step));
      const first = v.verify(code, 'u');
      if (!first.ok) continue;          // outside the configured window
      const second = v.verify(code, 'u');
      assert.equal(second.ok, false, `delta ${delta} was not replay-guarded`);
      assert.equal(second.reason, 'replayed');
    }
  });

  test('a replay from a DIFFERENT peer is still rejected', () => {
    // The replay guard keys on the time step, not the caller — otherwise a
    // code shoulder-surfed on one device could be spent on another.
    const v = new TotpVerifier({ secret: SECRET });
    const code = authenticator.generate(SECRET);
    assert.equal(v.verify(code, 'alice').ok, true);
    assert.equal(v.verify(code, 'bob').reason, 'replayed');
  });

  test('a replay does not count as a failure', () => {
    // A double-submitted form must not spend the user's attempt budget.
    const v = new TotpVerifier({ secret: SECRET, maxFailures: 2 });
    const code = authenticator.generate(SECRET);
    v.verify(code, 'u');
    v.verify(code, 'u');
    v.verify(code, 'u');
    // Still able to fail twice before being limited.
    assert.equal(v.verify('000000', 'u').reason, 'invalid');
    assert.equal(v.verify('000001', 'u').reason, 'invalid');
    assert.equal(v.verify('000002', 'u').reason, 'rate_limited');
  });

  test('rate-limits on failures, per bucket', () => {
    const v = new TotpVerifier({ secret: SECRET, maxFailures: 3 });
    for (let i = 0; i < 3; i++) assert.equal(v.verify('000000', 'alice').ok, false);
    assert.equal(v.verify('000000', 'alice').reason, 'rate_limited');
    // Another peer is unaffected — one user cannot lock out another.
    assert.equal(v.verify('000000', 'bob').reason, 'invalid');
  });

  test('a success clears the failure count', () => {
    const v = new TotpVerifier({ secret: SECRET, maxFailures: 3 });
    v.verify('000000', 'u');
    v.verify('000000', 'u');
    assert.equal(v.verify(authenticator.generate(SECRET), 'u').ok, true);
    for (let i = 0; i < 3; i++) assert.equal(v.verify('111111', 'u').reason, 'invalid');
  });

  test('rejects malformed input without consulting the secret', () => {
    const v = new TotpVerifier({ secret: SECRET });
    for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, '12 34 56 78']) {
      assert.equal(v.verify(bad, 'u').reason, 'malformed', `expected malformed for ${JSON.stringify(bad)}`);
    }
  });

  test('tolerates spaces, because password managers insert them', () => {
    const v = new TotpVerifier({ secret: SECRET });
    const code = authenticator.generate(SECRET);
    assert.equal(v.verify(`${code.slice(0, 3)} ${code.slice(3)}`, 'u').ok, true);
  });

  test('refuses to construct without a secret', () => {
    assert.throws(() => new TotpVerifier({ secret: '' }), /TOTP_SECRET is required/);
  });
});

/* ══ device trust ═══════════════════════════════════════════════════════ */

describe('device trust', () => {
  const peer = { login: 'oj@example.com', nodeId: '42', display: 'oj', node: 'iphone' };
  let file;

  beforeEach(() => {
    file = join(TMP, `devices-${Math.random().toString(36).slice(2)}.json`);
  });

  test('issues a cookie and redeems it', () => {
    const s = new DeviceStore({ file });
    const { cookie, device } = s.issue({ peer, userAgent: 'Mozilla/5.0 (iPhone) Safari/605' });
    assert.match(cookie, /^[\w-]+\.[\w-]+$/);
    assert.equal(device.label, 'iPhone · Safari');
    assert.equal(s.redeem(cookie, peer).ok, true);
  });

  test('never stores the raw token', () => {
    const s = new DeviceStore({ file });
    const { cookie } = s.issue({ peer });
    const token = cookie.split('.')[1];
    const onDisk = readFileSync(file, 'utf8');
    assert.equal(onDisk.includes(token), false, 'raw token must not reach disk');
    assert.match(onDisk, /"tokenHash":/);
  });

  test('never returns the token hash to a caller', () => {
    const s = new DeviceStore({ file });
    s.issue({ peer });
    assert.equal(Object.hasOwn(s.list()[0], 'tokenHash'), false);
  });

  test('rotates the token on every redemption', () => {
    const s = new DeviceStore({ file });
    const { cookie } = s.issue({ peer });
    const first = s.redeem(cookie, peer);
    assert.equal(first.ok, true);
    assert.notEqual(first.cookie, cookie, 'redeeming must issue a new token');

    const second = s.redeem(first.cookie, peer);
    assert.equal(second.ok, true);
    assert.notEqual(second.cookie, first.cookie);
  });

  test('a stale (cloned) cookie revokes the device outright', () => {
    // The theft-detection property: once rotated, the old copy is not just
    // refused, it burns the device — we cannot tell thief from owner, so the
    // safe move is to force one TOTP re-entry.
    const s = new DeviceStore({ file });
    const { cookie } = s.issue({ peer });
    const rotated = s.redeem(cookie, peer);
    assert.equal(rotated.ok, true);

    const stale = s.redeem(cookie, peer);
    assert.equal(stale.ok, false);
    assert.equal(stale.reason, 'stale_token');

    // ...and the freshly rotated one no longer works either.
    assert.equal(s.redeem(rotated.cookie, peer).ok, false);
    assert.equal(s.list().length, 0);
  });

  test('is bound to the peer that created it', () => {
    const s = new DeviceStore({ file });
    const { cookie } = s.issue({ peer });
    const other = { login: 'someone@else.com', nodeId: '99' };
    assert.equal(s.redeem(cookie, other).reason, 'peer_mismatch');
    // The legitimate peer still works — a rejected impostor must not have
    // burned the device.
    assert.equal(s.redeem(cookie, peer).ok, true);
  });

  test('survives a restart', () => {
    const s1 = new DeviceStore({ file });
    const { cookie } = s1.issue({ peer });
    const s2 = new DeviceStore({ file });          // simulate process restart
    assert.equal(s2.redeem(cookie, peer).ok, true);
  });

  test('expires after the trust window', () => {
    const s = new DeviceStore({ file, trustDays: 30 });
    const { cookie } = s.issue({ peer });
    const id = cookie.split('.')[0];

    // Reach in and age it, rather than waiting 30 days.
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    raw.devices[0].expiresAt = Date.now() - 1000;
    writeFileSync(file, JSON.stringify(raw));

    const s2 = new DeviceStore({ file, trustDays: 30 });
    assert.equal(s2.redeem(cookie, peer).reason, 'unknown');   // pruned on load
    assert.equal(s2.list().find((d) => d.id === id), undefined);
  });

  test('redemption slides the expiry forward', () => {
    const s = new DeviceStore({ file, trustDays: 30 });
    const { cookie } = s.issue({ peer });
    const before = s.list()[0].expiresAt;
    const r = s.redeem(cookie, peer);
    assert.ok(s.list()[0].expiresAt >= before, 'a used device should not age out mid-use');
    assert.equal(r.ok, true);
  });

  test('revoke and revokeAll', () => {
    const s = new DeviceStore({ file });
    const a = s.issue({ peer });
    const b = s.issue({ peer });
    assert.equal(s.list().length, 2);

    assert.equal(s.revoke(a.device.id), true);
    assert.equal(s.revoke(a.device.id), false);
    assert.equal(s.redeem(a.cookie, peer).reason, 'unknown');
    assert.equal(s.redeem(b.cookie, peer).ok, true);

    assert.equal(s.revokeAll(), 1);
    assert.equal(s.list().length, 0);
  });

  test('exists() is what makes revocation immediate', () => {
    // Sessions are stateless signed cookies, so revoking a device would
    // otherwise leave the session it minted alive for the full session TTL.
    // The server checks exists() on every device-minted session.
    const s = new DeviceStore({ file });
    const { device } = s.issue({ peer });
    assert.equal(s.exists(device.id), true);
    s.revoke(device.id);
    assert.equal(s.exists(device.id), false);
    assert.equal(s.exists('never-existed'), false);
  });

  test('exists() reports an expired device as gone', () => {
    const s = new DeviceStore({ file });
    const { device } = s.issue({ peer });
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    raw.devices[0].expiresAt = Date.now() - 1;
    writeFileSync(file, JSON.stringify(raw));

    const s2 = new DeviceStore({ file });
    assert.equal(s2.exists(device.id), false);
  });

  test('clone detection revokes, so exists() goes false for both copies', () => {
    const s = new DeviceStore({ file });
    const { cookie, device } = s.issue({ peer });
    const rotated = s.redeem(cookie, peer);
    s.redeem(cookie, peer);                       // the clone, now stale
    assert.equal(s.exists(device.id), false, 'device must be gone');
    assert.equal(s.redeem(rotated.cookie, peer).ok, false, 'the honest copy dies too — the safe direction');
  });

  test('a corrupt store starts clean instead of crashing', () => {
    writeFileSync(file, '{ this is not json');
    const s = new DeviceStore({ file });
    assert.deepEqual(s.list(), []);
    assert.equal(s.issue({ peer }).cookie.length > 0, true);
  });

  test('rejects malformed cookies', () => {
    const s = new DeviceStore({ file });
    for (const bad of ['', 'nodot', '.', '.token', 'id.', null]) {
      const r = s.redeem(bad, peer);
      assert.equal(r.ok, false);
      assert.ok(['absent', 'malformed'].includes(r.reason), `${JSON.stringify(bad)} -> ${r.reason}`);
    }
  });
});

/* ══ sessions ═══════════════════════════════════════════════════════════ */

describe('sessions', () => {
  test('round-trips', () => {
    const c = new SessionCodec({ keys: KEY, ttlMs: 60_000 });
    const v = c.verify(c.issue({ user: 'oj' }));
    assert.equal(v.ok, true);
    assert.equal(v.session.user, 'oj');
  });

  test('rejects a tampered payload', () => {
    const c = new SessionCodec({ keys: KEY, ttlMs: 60_000 });
    const cookie = c.issue({ user: 'oj' });
    const [body, sig] = cookie.split('.');
    const forged = Buffer.from(JSON.stringify({ user: 'root', exp: Date.now() + 1e6 })).toString('base64url');
    assert.equal(c.verify(`${forged}.${sig}`).reason, 'bad_signature');
    assert.equal(c.verify(`${body}x.${sig}`).reason, 'bad_signature');
  });

  test('rejects an expired session', () => {
    const c = new SessionCodec({ keys: KEY, ttlMs: -1 });
    assert.equal(c.verify(c.issue({ user: 'oj' })).reason, 'expired');
  });

  test('key rotation keeps existing sessions valid', () => {
    const oldCodec = new SessionCodec({ keys: 'o'.repeat(48), ttlMs: 60_000 });
    const cookie = oldCodec.issue({ user: 'oj' });
    // New key first, old key retained.
    const rotated = new SessionCodec({ keys: ['n'.repeat(48), 'o'.repeat(48)], ttlMs: 60_000 });
    assert.equal(rotated.verify(cookie).ok, true);

    // Drop the old key and the session dies, as intended.
    const purged = new SessionCodec({ keys: ['n'.repeat(48)], ttlMs: 60_000 });
    assert.equal(purged.verify(cookie).ok, false);
  });

  test('refuses a short secret', () => {
    assert.throws(() => new SessionCodec({ keys: 'short', ttlMs: 1 }), /at least 32 characters/);
    assert.throws(() => new SessionCodec({ keys: [], ttlMs: 1 }), /SESSION_SECRET is required/);
  });

  test('cookie parsing handles the shapes browsers actually send', () => {
    assert.deepEqual(parseCookies('a=1; b=2'), { a: '1', b: '2' });
    assert.deepEqual(parseCookies('a=1;b=2'), { a: '1', b: '2' });
    assert.deepEqual(parseCookies(''), {});
    assert.deepEqual(parseCookies('novalue'), {});
    assert.deepEqual(parseCookies('a=%20x%20'), { a: ' x ' });
    // A malformed percent-escape must not throw — it would 500 every request.
    assert.deepEqual(parseCookies('a=%E0%A4%A'), { a: '%E0%A4%A' });
  });

  test('cookie flags: HttpOnly and SameSite always, Secure conditionally', () => {
    const insecure = cookieHeader('n', 'v', { maxAgeMs: 1000, secure: false });
    assert.match(insecure, /HttpOnly/);
    assert.match(insecure, /SameSite=Lax/);
    assert.doesNotMatch(insecure, /Secure/);
    assert.match(cookieHeader('n', 'v', { maxAgeMs: 1000, secure: true }), /Secure/);
    assert.match(cookieHeader('n', '', { maxAgeMs: 0, secure: true }), /Max-Age=0/);
  });
});

/* ══ tailnet gate ═══════════════════════════════════════════════════════ */

describe('tailnet gate', () => {
  const { inCidr } = tsInternals;

  // `ip` models what Express computes from X-Forwarded-For under
  // `trust proxy`. Behind Caddy the socket is the PROXY and only req.ip is
  // the real peer, so a helper that could not express that was how the
  // proxy bug shipped.
  const run = (gate, remoteAddress, headers = {}, ip = undefined) => new Promise((resolve) => {
    const req = { ip, socket: { remoteAddress }, headers, get: (h) => headers[String(h).toLowerCase()] };
    const res = {
      code: null, body: null,
      status(c) { this.code = c; return this; },
      type() { return this; },
      send(b) { this.body = b; resolve({ blocked: true, code: this.code, req }); },
    };
    gate(req, res, () => resolve({ blocked: false, req }));
  });

  test('behind a reverse proxy, the gate reads the forwarded peer', async () => {
    const gate = tailnetGate({ cliPath: '/nonexistent/tailscale' });

    // Caddy's container address on the socket, the real tailnet peer in
    // req.ip. Reading the socket here is what 404'd every real user.
    const ok = await run(gate, '172.18.0.5', {}, '100.100.100.100');
    assert.equal(ok.blocked, false, 'a tailnet peer behind a proxy must pass');
    assert.equal(ok.req.peer.source, 'cidr');

    // And a non-tailnet client behind the same proxy must still be refused,
    // so the fix cannot have turned the proxy into a bypass.
    const bad = await run(gate, '172.18.0.5', {}, '8.8.8.8');
    assert.equal(bad.blocked, true);
    assert.equal(bad.code, 404);
  });

  test('with no proxy, the socket address is still used', async () => {
    const gate = tailnetGate({ cliPath: '/nonexistent/tailscale' });
    const ok = await run(gate, '100.100.100.100');
    assert.equal(ok.blocked, false, 'standalone behaviour must not change');
    const bad = await run(gate, '8.8.8.8');
    assert.equal(bad.blocked, true);
    assert.equal(bad.code, 404);
  });

  test('peerAddress honours exactly the trusted hops', () => {
    const req = (xff, sock) => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: sock } });

    // No trusted proxy: the header is not consulted at all, or a direct
    // client could simply name itself.
    assert.equal(peerAddress(req('1.2.3.4', '8.8.8.8'), 0), '8.8.8.8');

    // One trusted hop: the proxy APPENDS the true peer, so the LAST entry
    // wins and anything the client injected sits to its left, ignored.
    assert.equal(peerAddress(req('100.100.100.100', '172.18.0.4'), 1), '100.100.100.100');
    assert.equal(peerAddress(req('9.9.9.9, 100.100.100.100', '172.18.0.4'), 1), '100.100.100.100');

    // No header behind a proxy: fall back to the socket rather than guessing.
    assert.equal(peerAddress(req(null, '172.18.0.4'), 1), '172.18.0.4');
  });

  test('revoking a device invalidates the session it was enrolled with', () => {
    // The enrolment session used to be issued BEFORE the device existed, so it
    // carried no deviceId — and only sessions naming a device are revocable.
    // Revoking then killed every future redemption while leaving the browser
    // that enrolled the device logged in for the rest of the session's life.
    const dir = mkdtempSync(join(tmpdir(), 'ojc-rev-'));
    const store = new DeviceStore({ file: join(dir, 'devices.json'), trustDays: 30 });
    const peer = { login: 'me', display: 'Me', node: 'n', nodeId: 'n1' };
    const { device } = store.issue({ peer, label: 'phone', userAgent: 'ua' });

    // A session bound to that device is valid only while the device exists.
    const bound = { user: 'me', via: 'totp', deviceId: device.id };
    const stillValid = (sess) => {
      if (sess.user && peer.login && sess.user !== peer.login) return false;
      if (sess.deviceId && !store.exists(sess.deviceId)) return false;
      return true;
    };

    assert.equal(stillValid(bound), true, 'valid before revocation');
    store.revoke(device.id);
    assert.equal(stillValid(bound), false, 'revocation must log the device out');

    // A session with no deviceId is NOT revocable this way — that is the
    // limitation the enrolment binding exists to avoid re-introducing.
    assert.equal(stillValid({ user: 'me', via: 'totp' }), true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('CIDR maths', () => {
    assert.equal(inCidr('100.100.100.100', '100.64.0.0/10'), true);
    assert.equal(inCidr('100.127.255.255', '100.64.0.0/10'), true);
    assert.equal(inCidr('100.128.0.1', '100.64.0.0/10'), false);
    assert.equal(inCidr('100.63.255.255', '100.64.0.0/10'), false);
    assert.equal(inCidr('8.8.8.8', '100.64.0.0/10'), false);
    assert.equal(inCidr('192.168.1.5', '192.168.1.0/24'), true);
    assert.equal(inCidr('192.168.2.5', '192.168.1.0/24'), false);
    assert.equal(inCidr('fd7a:115c:a1e0::1', 'fd7a:115c:a1e0::/48'), true);
    assert.equal(inCidr('fd7a:115c:a1e1::1', 'fd7a:115c:a1e0::/48'), false);
  });

  test('normalises IPv4-mapped IPv6, or the whole tailnet is locked out', () => {
    // Node hands back ::ffff:100.x.y.z on a dual-stack listener. Without this
    // every v4 peer fails the v4 CIDR test and the gate rejects everyone.
    assert.equal(normalizeAddr('::ffff:100.100.100.100'), '100.100.100.100');
    assert.equal(normalizeAddr('fe80::1%eth0'), 'fe80::1');
    assert.equal(normalizeAddr(undefined), '');
    assert.equal(inCidr(normalizeAddr('::ffff:100.100.100.100'), '100.64.0.0/10'), true);
  });

  test('404s a public address — never 403', async () => {
    // 403 confirms something is here. 404 does not.
    const gate = tailnetGate({ cliPath: '/nonexistent-tailscale' });
    const r = await run(gate, '8.8.8.8');
    assert.equal(r.blocked, true);
    assert.equal(r.code, 404);
  });

  test('admits a tailnet address via CIDR fallback', async () => {
    const gate = tailnetGate({ cliPath: '/nonexistent-tailscale' });
    const r = await run(gate, '::ffff:100.100.100.100');
    assert.equal(r.blocked, false);
    assert.equal(r.req.peer.source, 'cidr');
  });

  test('loopback is blocked unless explicitly allowed', async () => {
    assert.equal((await run(tailnetGate({ cliPath: '/nope' }), '127.0.0.1')).blocked, true);
    const dev = tailnetGate({ cliPath: '/nope', allowLoopback: true });
    assert.equal((await run(dev, '127.0.0.1')).blocked, false);
  });

  test('identity headers are ignored unless trustProxyIdentity is on', async () => {
    // Otherwise anything that can reach the port asserts whoever it likes.
    const headers = { 'tailscale-user-login': 'attacker@evil.com' };
    const strict = tailnetGate({ cliPath: '/nope' });
    assert.equal((await run(strict, '8.8.8.8', headers)).blocked, true);

    const trusting = tailnetGate({ cliPath: '/nope', trustProxyIdentity: true });
    const r = await run(trusting, '8.8.8.8', headers);
    assert.equal(r.blocked, false);
    assert.equal(r.req.peer.login, 'attacker@evil.com');
    assert.equal(r.req.peer.source, 'proxy-header');
  });
});

/* ══ module identity signing ════════════════════════════════════════════ */

describe('module identity', () => {
  const secret = 'identity-secret';

  test('verifies its own signature', () => {
    const ts = String(Date.now());
    const sig = signIdentity({ user: 'oj', moduleId: 'home', ts, secret });
    assert.equal(verifyIdentity({ user: 'oj', moduleId: 'home', ts, signature: sig, secret }), true);
  });

  test('a signature does not transfer between modules or users', () => {
    const ts = String(Date.now());
    const sig = signIdentity({ user: 'oj', moduleId: 'home', ts, secret });
    assert.equal(verifyIdentity({ user: 'oj', moduleId: 'loq', ts, signature: sig, secret }), false);
    assert.equal(verifyIdentity({ user: 'eve', moduleId: 'home', ts, signature: sig, secret }), false);
    assert.equal(verifyIdentity({ user: 'oj', moduleId: 'home', ts, signature: sig, secret: 'other' }), false);
  });

  test('a captured header set cannot be replayed indefinitely', () => {
    const old = String(Date.now() - 10 * 60_000);
    const sig = signIdentity({ user: 'oj', moduleId: 'home', ts: old, secret });
    assert.equal(verifyIdentity({ user: 'oj', moduleId: 'home', ts: old, signature: sig, secret }), false);
  });

  test('rejects junk without throwing', () => {
    const ts = String(Date.now());
    for (const sig of ['', 'x', null, undefined, 'a'.repeat(1000)]) {
      assert.equal(verifyIdentity({ user: 'oj', moduleId: 'home', ts, signature: sig, secret }), false);
    }
    assert.equal(verifyIdentity({ user: 'oj', moduleId: 'home', ts: 'NaN', signature: 'x', secret }), false);
  });
});

/* ══ module registry ════════════════════════════════════════════════════ */

describe('module registry', () => {
  const manifest = (over = {}) => ({
    id: 'home', name: 'Home', version: '1.0.0',
    views: [{ id: 'overview', label: 'Overview', icon: 'i-grid' }],
    ui: '/ui/index.js', health: '/api/health', ...over,
  });

  // `seen` records the options each probe was called with, so a test can
  // assert on the Authorization header the registry sent.
  const fakeFetch = (routes, seen = []) => async (url, opts = {}) => {
    const path = new URL(url).pathname;
    seen.push({ path, headers: opts.headers || {} });
    const r = routes[path];
    if (r === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (r instanceof Error) throw r;
    return { ok: true, status: 200, json: async () => r };
  };

  test('a module token is sent upstream and never exposed downstream', async () => {
    const seen = [];
    const reg = new ModuleRegistry({
      configured: [{ id: 'loq', origin: 'http://loq:8300', token: 'super-secret' }],
      fetchImpl: fakeFetch({ '/module.json': manifest({ id: 'loq' }), '/api/health': { ok: true } }, seen),
    });
    await reg.refreshAll();

    // Both probes must carry it, or a guarded module reports itself down.
    assert.ok(seen.length >= 2, 'manifest and health should both be probed');
    for (const call of seen) {
      assert.equal(call.headers.authorization, 'Bearer super-secret', `${call.path} missing auth`);
    }

    // And it must not reach the browser just because it can read the nav.
    const [pub] = reg.publicList();
    assert.equal(pub.token, undefined);
    assert.ok(!JSON.stringify(pub).includes('super-secret'));
  });

  test('a module without a token sends no Authorization at all', async () => {
    const seen = [];
    const reg = new ModuleRegistry({
      configured: [{ id: 'home', origin: 'http://home:8110' }],
      fetchImpl: fakeFetch({ '/module.json': manifest(), '/api/health': { ok: true } }, seen),
    });
    await reg.refreshAll();
    for (const call of seen) {
      assert.equal(call.headers.authorization, undefined);
    }
  });

  test('a healthy module becomes ready', async () => {
    const reg = new ModuleRegistry({
      configured: [{ id: 'home', origin: 'http://home:8110' }],
      fetchImpl: fakeFetch({ '/module.json': manifest(), '/api/health': { ok: true } }),
    });
    await reg.refreshAll();
    const [m] = reg.publicList();
    assert.equal(m.status, 'ready');
    assert.equal(m.views.length, 1);
    assert.equal(m.reason, null);
  });

  test('an unreachable module DEGRADES, it does not disappear', async () => {
    // Hiding a broken module makes a bad deploy look like a feature that was
    // never built — the worst failure mode a modular app has.
    const reg = new ModuleRegistry({
      configured: [{ id: 'home', origin: 'http://home:8110' }],
      fetchImpl: fakeFetch({ '/module.json': Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }) }),
    });
    await reg.refreshAll();
    const [m] = reg.publicList();
    assert.equal(reg.publicList().length, 1, 'the module must still be listed');
    assert.equal(m.status, 'unreachable');
    assert.match(m.reason, /ECONNREFUSED/);
  });

  test('serving a manifest but failing health is degraded, not ready', async () => {
    const reg = new ModuleRegistry({
      configured: [{ id: 'home', origin: 'http://home:8110' }],
      fetchImpl: fakeFetch({ '/module.json': manifest(), '/api/health': { ok: false, reason: 'AC unreachable' } }),
    });
    await reg.refreshAll();
    const [m] = reg.publicList();
    assert.equal(m.status, 'degraded');
    assert.equal(m.reason, 'AC unreachable');
  });

  test('an id mismatch is caught — it would break every URL the module builds', async () => {
    const reg = new ModuleRegistry({
      configured: [{ id: 'home', origin: 'http://x' }],
      fetchImpl: fakeFetch({ '/module.json': manifest({ id: 'remote' }) }),
    });
    await reg.refreshAll();
    assert.equal(reg.publicList()[0].status, 'invalid');
  });

  test('disabled modules are reported as disabled, not probed', async () => {
    let called = false;
    const reg = new ModuleRegistry({
      configured: [{ id: 'agent', origin: 'http://agent:8080', enabled: false }],
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    });
    await reg.refreshAll();
    assert.equal(called, false);
    assert.equal(reg.publicList()[0].status, 'disabled');
  });

  test('rejects an invalid module id at construction', () => {
    for (const id of ['Home', '1home', 'home_hub', '', 'a'.repeat(40), '../etc']) {
      assert.throws(() => new ModuleRegistry({ configured: [{ id, origin: 'http://x' }] }), /invalid/);
    }
  });

  test('manifest validation', () => {
    assert.equal(validateManifest(manifest(), 'home'), null);
    assert.match(validateManifest(null, 'home'), /not an object/);
    assert.match(validateManifest(manifest({ views: [] }), 'home'), /no views/);
    assert.match(validateManifest(manifest({ views: [{ id: 'a' }] }), 'home'), /missing id or label/);
    assert.match(validateManifest(manifest({ ui: 'ui/index.js' }), 'home'), /root-relative/);
  });
});
