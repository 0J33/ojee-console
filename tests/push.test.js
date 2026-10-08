import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';
import ece from 'http_ece';
import { loadVapid, PushStore, cleanSubscription, deviceId, topicOf, payloadOf, TTL_SEC } from '../src/notify/push.js';
import { PrefsStore } from '../src/notify/prefs.js';
import { NotifyCenter } from '../src/notify/center.js';

const TZ = 'Africa/Cairo';
const NOON = Date.parse('2026-10-08T09:00:00Z');
const NIGHT = Date.parse('2026-10-08T20:30:00Z');

/** A browser's side of a subscription: an ECDH pair and an auth secret it can decrypt with. */
function fakeBrowser(endpoint) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh, auth,
    sub: { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } },
    decrypt: (body) => JSON.parse(ece.decrypt(body, { version: 'aes128gcm', privateKey: ecdh, authSecret: auth.toString('base64url') }).toString('utf8')),
  };
}

/** A push service that records every request and answers with `status(endpoint)`. */
function fakePushService(status = () => 201) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: Buffer.from(init.body) });
    return new Response(status(String(url)) === 201 ? '' : 'NotRegistered', { status: status(String(url)) });
  };
  return { calls, fetchImpl };
}

test('vapid: made once, kept 0600, the same pair on the next start', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ojc-push-'));
  const file = join(dir, 'vapid.json');
  const a = loadVapid(file);
  assert.equal(a.created, true);
  assert.match(a.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const b = loadVapid(file);
  assert.equal(b.created, false);
  assert.equal(b.publicKey, a.publicKey);
  assert.equal(b.privateKey, a.privateKey);
});

test('subscriptions: only real push services, stored 0600, the page never sees an endpoint or key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ojc-push-'));
  const file = join(dir, 'subs.json');
  const vapid = loadVapid(join(dir, 'vapid.json'));
  const s = new PushStore({ file, vapid });
  const good = fakeBrowser('https://web.push.apple.com/QGuQy-abc');
  assert.throws(() => s.add({ ...good.sub, endpoint: 'https://evil.example/x' }), /Not a known push service/);
  assert.throws(() => s.add({ ...good.sub, endpoint: 'http://fcm.googleapis.com/fcm/send/x' }), /https/);
  assert.throws(() => s.add({ ...good.sub, keys: { p256dh: 'short', auth: good.sub.keys.auth } }), /p256dh/);
  assert.throws(() => cleanSubscription(null), /No subscription/);
  const rec = s.add(good.sub, { label: 'iPhone (Home Screen)' });
  assert.equal(rec.id, deviceId(good.sub.endpoint));
  assert.equal(rec.id.length, 16);
  // Re-subscribing the same browser updates it rather than adding a second.
  s.add(good.sub, { label: '' });
  assert.equal(s.count(), 1);
  assert.equal(s.devices()[0].label, 'iPhone (Home Screen)');
  const view = JSON.stringify(s.devices());
  assert.ok(!view.includes('QGuQy') && !view.includes(good.sub.keys.p256dh), 'no endpoint or key in the view');
  assert.equal(s.devices()[0].service, 'web.push.apple.com');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(new PushStore({ file, vapid }).count(), 1, 'kept across restarts');
  assert.ok(s.rename(rec.id, 'Phone'));
  assert.equal(s.devices()[0].label, 'Phone');
  // pushsubscriptionchange: the new endpoint replaces the old one.
  const moved = fakeBrowser('https://web.push.apple.com/NEW-endpoint');
  s.add(moved.sub, { replaces: good.sub.endpoint });
  assert.equal(s.count(), 1);
  assert.equal(s.devices()[0].label, 'Phone', 'the name follows');
  assert.ok(s.remove(deviceId(moved.sub.endpoint)));
  assert.equal(s.count(), 0);
});

test('delivery: encrypted payload the browser can read, TTL/urgency/topic, VAPID header, small', async () => {
  const vapid = loadVapid(join(mkdtempSync(join(tmpdir(), 'ojc-push-')), 'vapid.json'));
  const svc = fakePushService();
  const s = new PushStore({ vapid, subject: 'https://console.test', fetchImpl: svc.fetchImpl });
  const b = fakeBrowser('https://fcm.googleapis.com/fcm/send/abc123');
  s.add(b.sub, { label: 'Chrome on Linux' });
  const ev = { key: 'k1', id: 'health.illness', title: 'Possible illness', body: 'x'.repeat(5000), tag: 'health.illness:d1', severity: 'warn', route: '#/health/today', at: NOON };
  const r = await s.sendAll(ev);
  assert.equal(r.sent, 1);
  assert.equal(r.summary, 'push 1 sent');
  const c = svc.calls[0];
  assert.equal(c.url, b.sub.endpoint);
  assert.equal(c.headers.TTL, TTL_SEC);
  assert.equal(c.headers.Urgency, 'high');
  assert.equal(c.headers.Topic, topicOf('health.illness:d1'));
  assert.ok(c.headers.Topic.length <= 32);
  assert.equal(c.headers['Content-Encoding'], 'aes128gcm');
  assert.match(c.headers.Authorization, new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`));
  assert.ok(c.body.length < 4096, `payload is ${c.body.length} bytes`);
  const p = b.decrypt(c.body);
  assert.deepEqual(Object.keys(p).sort(), ['at', 'body', 'icon', 'key', 'route', 'severity', 'tag', 'title']);
  assert.equal(p.title, 'Possible illness');
  assert.equal(p.route, '#/health/today');
  assert.equal(p.severity, 'warn');
  assert.equal(p.icon, '/icon-192.png');
  assert.equal(p.body.length, 600, 'body trimmed');
  assert.ok(!c.body.includes(Buffer.from('Possible illness')), 'not in the clear');
  assert.ok(s.devices()[0].lastOkAt);
  // info is normal urgency; a junk route becomes the home page.
  await s.sendAll({ title: 't', severity: 'info', route: 'javascript:alert(1)', tag: 'x' });
  assert.equal(svc.calls[1].headers.Urgency, 'normal');
  assert.equal(b.decrypt(svc.calls[1].body).route, '#/');
  assert.equal(JSON.parse(payloadOf({ title: 'a' })).route, '#/');
});

test('delivery: 410/404 removes the device, other failures are recorded and kept', async () => {
  const vapid = loadVapid(join(mkdtempSync(join(tmpdir(), 'ojc-push-')), 'vapid.json'));
  const svc = fakePushService((u) => (u.includes('gone') ? 410 : u.includes('broken') ? 500 : 201));
  const s = new PushStore({ vapid, fetchImpl: svc.fetchImpl });
  s.add(fakeBrowser('https://fcm.googleapis.com/fcm/send/gone').sub, { label: 'Old phone' });
  s.add(fakeBrowser('https://updates.push.services.mozilla.com/wpush/v2/broken').sub, { label: 'Firefox' });
  s.add(fakeBrowser('https://web.push.apple.com/fine').sub, { label: 'iPhone' });
  const r = await s.sendAll({ title: 'x', tag: 't' });
  assert.equal(r.sent, 1);
  assert.equal(r.gone, 1);
  assert.equal(r.failed, 1);
  assert.match(r.summary, /^push 1 sent · 1 failed \(Firefox: 500\) · 1 gone, removed$/);
  assert.deepEqual(s.devices().map((d) => d.label), ['Firefox', 'iPhone']);
  const ff = s.devices().find((d) => d.label === 'Firefox');
  assert.match(ff.lastError, /^500 /);
  assert.ok(ff.lastErrorAt);
});

test('delivery: a dropped connection is retried once; an answer is never retried', async () => {
  const vapid = loadVapid(join(mkdtempSync(join(tmpdir(), 'ojc-push-')), 'vapid.json'));
  let calls = 0;
  const flaky = async () => { calls += 1; if (calls === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); return new Response('', { status: 201 }); };
  const s = new PushStore({ vapid, fetchImpl: flaky, retryMs: 1 });
  s.add(fakeBrowser('https://web.push.apple.com/a').sub);
  assert.equal((await s.sendAll({ title: 'x' })).sent, 1);
  assert.equal(calls, 2);
  let answers = 0;
  const s2 = new PushStore({ vapid, fetchImpl: async () => { answers += 1; return new Response('', { status: 500 }); }, retryMs: 1 });
  s2.add(fakeBrowser('https://web.push.apple.com/b').sub);
  assert.equal((await s2.sendAll({ title: 'x' })).failed, 1);
  assert.equal(answers, 1);
  let dead = 0;
  const s3 = new PushStore({ vapid, fetchImpl: async () => { dead += 1; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }, retryMs: 1 });
  s3.add(fakeBrowser('https://web.push.apple.com/c').sub);
  const r = await s3.sendAll({ title: 'x' });
  assert.equal(dead, 2);
  assert.match(r.summary, /ECONNREFUSED/);
});

test('router → push: one decision, every device; cooldown, quiet hours and "off" send nothing; logged in Recent', async () => {
  const vapid = loadVapid(join(mkdtempSync(join(tmpdir(), 'ojc-push-')), 'vapid.json'));
  const svc = fakePushService();
  let clock = NOON;
  const push = new PushStore({ vapid, fetchImpl: svc.fetchImpl, now: () => clock });
  const phone = fakeBrowser('https://web.push.apple.com/phone');
  const desk = fakeBrowser('https://fcm.googleapis.com/fcm/send/desk');
  push.add(phone.sub, { label: 'iPhone (Home Screen)' });
  push.add(desk.sub, { label: 'Chrome on Linux' });
  const mod = { id: 'health', enabled: true, status: 'ready', origin: 'http://health', manifest: { name: 'Health', capabilities: ['notify'], notifications: [
    { id: 'health.illness', label: 'Illness', severity: 'warn', defaultChannels: ['app'] },
    { id: 'health.battery', label: 'Battery', severity: 'info', defaultChannels: ['discord'] },
  ] } };
  const registry = { list: () => [mod], get: (id) => (id === 'health' ? mod : null) };
  const prefs = new PrefsStore({ file: null, env: {} });
  const sse = [];
  const c = new NotifyCenter({ registry, prefs, identitySecret: 's', tz: TZ, push, now: () => clock, fetchImpl: async () => new Response('{}') });
  c.on('app', (e) => sse.push(e));

  const rec = await c.handle('health', { id: 'health.illness', title: 'Possible illness', tag: 'd1', view: 'today' });
  assert.equal(rec.app, 'sent');
  assert.equal(sse.length, 1, 'open consoles still get the stream');
  assert.equal(svc.calls.length, 2, 'both devices');
  assert.equal(rec.push, 'push 2 sent');
  assert.equal(phone.decrypt(svc.calls[0].body).route, '#/health/today');
  assert.equal(c.history[0].push, 'push 2 sent');

  const again = await c.handle('health', { id: 'health.illness', title: 'Possible illness', tag: 'd1' });
  assert.equal(again.app, 'cooldown');
  assert.equal(svc.calls.length, 2, 'cooldown: no push');

  clock = NIGHT;
  const quiet = await c.handle('health', { id: 'health.illness', title: 'Night', tag: 'd2' });
  assert.equal(quiet.app, 'quiet');
  assert.equal(svc.calls.length, 2, 'quiet hours: no push');
  const crit = await c.handle('health', { id: 'health.illness', title: 'Critical', tag: 'd3', severity: 'critical' });
  assert.equal(crit.app, 'sent', 'critical gets through quiet hours by default');
  assert.equal(svc.calls.length, 4);

  clock = NOON + 3600_000;
  await c.handle('health', { id: 'health.battery', title: 'Battery low', tag: 'b' });
  assert.equal(svc.calls.length, 4, 'App off for the type: no push');

  // The page's tests.
  const t = await c.testApp(0);
  assert.equal(t.push.sent, 2);
  const one = await c.testPush(push.devices()[1].id);
  assert.equal(one.ok, true);
  assert.equal(svc.calls.length, 7);
  assert.equal(c.history[0].push, 'push 1 sent');
  assert.equal((await c.testPush('nope')).error, 'No such device');
});
