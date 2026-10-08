import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide, effective, inQuiet, toMin } from '../src/notify/policy.js';
import { PrefsStore, normalize, envWebhooks } from '../src/notify/prefs.js';
import { NotifyCenter } from '../src/notify/center.js';

const HOOK = 'https://discord.com/api/webhooks/123456/abcDEF_secret-token';
const TZ = 'Africa/Cairo';
// 2026-10-08 12:00 Cairo (UTC+3) and 23:30 Cairo.
const NOON = Date.parse('2026-10-08T09:00:00Z');
const NIGHT = Date.parse('2026-10-08T20:30:00Z');

const type = { id: 'health.battery', severity: 'warn', defaultChannels: ['app'], params: [{ key: 'threshold', default: 20 }] };

test('policy: defaults, choices, params', () => {
  assert.deepEqual(effective({}, type), { app: true, discord: false, cooldownMin: 5, params: { threshold: 20 } });
  const p = { types: { 'health.battery': { app: false, discord: true, cooldownMin: 0, params: { threshold: 30 } } } };
  assert.deepEqual(effective(p, type), { app: false, discord: true, cooldownMin: 0, params: { threshold: 30 } });
  assert.equal(toMin('23:00'), 1380);
  assert.equal(toMin('25:00'), null);
});

test('policy: quiet hours across midnight, critical let through only when allowed', () => {
  const quiet = { on: true, from: '23:00', to: '07:00', critical: true };
  assert.equal(inQuiet(quiet, NIGHT, TZ), true);
  assert.equal(inQuiet(quiet, NOON, TZ), false);
  assert.equal(inQuiet({ ...quiet, on: false }, NIGHT, TZ), false);
  const prefs = { quiet };
  assert.equal(decide(prefs, type, { severity: 'warn' }, { now: NIGHT, tz: TZ }).why, 'quiet');
  const crit = decide(prefs, type, { severity: 'critical', tag: 'x' }, { now: NIGHT, tz: TZ });
  assert.equal(crit.why, null);
  assert.equal(crit.app, true);
  assert.equal(decide({ quiet: { ...quiet, critical: false } }, type, { severity: 'critical' }, { now: NIGHT, tz: TZ }).why, 'quiet');
});

test('policy: cooldown per type and tag; off is off', () => {
  const last = new Map();
  assert.equal(decide({}, type, { tag: 'a' }, { now: NOON, last }).why, null);
  assert.equal(decide({}, type, { tag: 'a' }, { now: NOON + 60_000, last }).why, 'cooldown');
  assert.equal(decide({}, type, { tag: 'b' }, { now: NOON + 60_000, last }).why, null, 'another tag is another thing');
  assert.equal(decide({}, type, { tag: 'a' }, { now: NOON + 6 * 60_000, last }).why, null);
  assert.equal(decide({ types: { 'health.battery': { app: false, discord: false } } }, type, {}, { now: NOON }).why, 'off');
});

test('prefs: validated, saved 0600, webhook URLs never in the public view', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ojc-notify-'));
  const file = join(dir, 'notifications.json');
  const env = { NOTIFY_DISCORD_WEBHOOK: HOOK, NOTIFY_DISCORD_WEBHOOK_CLAUDE: `${HOOK}2` };
  const s = new PrefsStore({ file, env });
  assert.throws(() => s.addWebhook({ name: 'x', url: 'https://evil.example/hook' }), /not a Discord webhook/);
  const id = s.addWebhook({ name: 'Mine', url: `${HOOK}3` });
  s.patch({ quiet: { from: '22:30' }, discord: { modules: { agent: 'env:claude' } }, types: { 'health.battery': { discord: true, params: { threshold: 25 } }, 'BAD id': { app: true } } });
  assert.equal(s.get().quiet.from, '22:30');
  assert.equal(s.get().quiet.to, '07:00', 'the rest of quiet hours is kept');
  assert.equal(s.get().types['health.battery'].params.threshold, 25);
  assert.equal(s.get().types['BAD id'], undefined);
  assert.equal(s.webhookFor('agent').id, 'env:claude');
  assert.equal(s.webhookFor('health').id, id, 'the first saved webhook became the default');
  s.patch({ discord: { modules: { agent: null } } });
  assert.equal(s.webhookFor('agent').id, id);
  const view = JSON.stringify(s.publicView());
  assert.ok(!view.includes('secret-token'), 'no token in what the page sees');
  assert.match(view, /…ken3|…ken2|…oken/);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const again = new PrefsStore({ file, env });
  assert.equal(again.get().types['health.battery'].discord, true);
  assert.ok(readFileSync(file, 'utf8').includes('secret-token3'), 'saved webhooks are kept (server side)');
  assert.ok(s.removeWebhook(id));
  assert.equal(envWebhooks(env).length, 2);
  assert.deepEqual(normalize({ quiet: { from: 'nope' } }).quiet.from, '23:00');
});

/* ── the center, against a fake registry and a fake Discord ─────────── */

function fakeRegistry(mods) {
  const map = new Map(mods.map((m) => [m.id, { enabled: true, status: 'ready', origin: `http://${m.id}`, token: '', ...m }]));
  return { list: () => [...map.values()], get: (id) => map.get(id) };
}

function rig({ mods, prefs = {}, now = NOON, summaries = {} } = {}) {
  const posts = [];
  let clock = now;
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://discord.com/')) { posts.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    const m = /^http:\/\/([a-z]+)(\/.*)$/.exec(u);
    if (m && m[2] === '/api/summary') return new Response(JSON.stringify(summaries[m[1]]()), { status: 200 });
    if (m && m[2] === '/api/notify/prefs') { posts.push({ prefsTo: m[1], body: JSON.parse(init.body), headers: init.headers }); return new Response('{"ok":true}', { status: 200 }); }
    return new Response('{}', { status: 404 });
  };
  const store = new PrefsStore({ file: null, env: { NOTIFY_DISCORD_WEBHOOK: HOOK } });
  store.patch(prefs);
  const c = new NotifyCenter({ registry: fakeRegistry(mods), prefs: store, identitySecret: 's', publicOrigin: 'https://console.test', tz: TZ, fetchImpl, now: () => clock });
  const app = [];
  c.on('app', (e) => app.push(e));
  return { c, posts, app, store, set: (t) => { clock = t; } };
}

const healthMod = {
  id: 'health',
  manifest: { name: 'Health', icon: 'i-heart', capabilities: ['summary', 'sse', 'notify'], notifications: [
    { id: 'health.illness', label: 'Illness', severity: 'warn', defaultChannels: ['app', 'discord'], view: 'today' },
    { id: 'health.battery', label: 'Battery', severity: 'warn', defaultChannels: ['app'], params: [{ key: 'threshold', type: 'number', default: 20 }] },
    { id: 'fleet.sneaky', label: 'Not mine' },
  ] },
};
const homeMod = { id: 'home', manifest: { name: 'Home', capabilities: ['summary', 'sse'] } };
const agentMod = { id: 'agent', manifest: { name: 'Agent', capabilities: ['summary', 'sse', 'notify'], notifications: [
  { id: 'agent.claude-needs-input', label: 'Needs input', defaultChannels: ['app', 'discord'], discordBy: 'module' },
] } };

test('catalogue: declared types, a module cannot declare another module\'s, overview alerts for the rest', () => {
  const { c } = rig({ mods: [healthMod, homeMod, agentMod] });
  const cat = c.catalogue();
  assert.deepEqual(cat.map((g) => g.module), ['console', 'health', 'home', 'agent']);
  const h = cat.find((g) => g.module === 'health');
  assert.deepEqual(h.types.map((t) => t.id), ['health.illness', 'health.battery', 'health.other']);
  assert.deepEqual(cat.find((g) => g.module === 'home').types.map((t) => t.id), ['home.alert']);
  assert.equal(cat.find((g) => g.module === 'agent').types[0].discordBy, 'module');
});

test('routing: app + Discord by default for illness; Discord carries a link and no secrets leak', async () => {
  const { c, posts, app } = rig({ mods: [healthMod] });
  const rec = await c.handle('health', { id: 'health.illness', title: 'Possible illness', body: 'RHR up', tag: 'd1', view: 'today', at: NOON });
  assert.equal(rec.app, 'sent');
  assert.equal(rec.discord, 'sent');
  assert.equal(app[0].route, '#/health/today');
  assert.equal(posts[0].embeds[0].title, 'Possible illness');
  assert.match(posts[0].embeds[0].description, /\[Open in console\]\(https:\/\/console\.test\/#\/health\/today\)/);
  assert.equal(posts[0].username, 'health');
  assert.ok(!JSON.stringify(c.history).includes('secret-token'));
});

test('routing: a type switched off, quiet hours, cooldown; an unknown id falls back to <module>.other', async () => {
  const { c, posts, app, set } = rig({ mods: [healthMod], prefs: { types: { 'health.illness': { discord: false } } } });
  await c.handle('health', { id: 'health.illness', title: 'x', tag: 't' });
  assert.equal(app.length, 1); assert.equal(posts.length, 0);
  const r2 = await c.handle('health', { id: 'health.illness', title: 'x', tag: 't' });
  assert.equal(r2.app, 'cooldown');
  set(NIGHT);
  const r3 = await c.handle('health', { id: 'health.battery', title: 'low', tag: 'b' });
  assert.equal(r3.app, 'quiet');
  set(NOON);
  const r4 = await c.handle('health', { id: 'nonsense', title: 'hello' });
  assert.equal(r4.id, 'health.other');
  const r5 = await c.handle('health', { id: 'fleet.sneaky', title: 'spoof' });
  assert.equal(r5.id, 'health.other', 'a module cannot speak for another');
});

test('routing: a type the module sends to Discord itself is not sent twice', async () => {
  const { c, posts, app } = rig({ mods: [agentMod] });
  const r = await c.handle('agent', { id: 'agent.claude-needs-input', title: 'needs you' });
  assert.equal(r.discord, 'by module');
  assert.equal(posts.length, 0);
  assert.equal(app.length, 1);
});

test('overview alerts: new and still there a poll later; not what was there at start; re-armed when cleared', async () => {
  let alerts = [{ text: 'AC: offline', severity: 'err', view: 'devices' }];
  const { c, app } = rig({ mods: [homeMod], summaries: { home: () => ({ alerts }) } });
  await c.checkAlerts(); await c.checkAlerts();
  assert.equal(app.length, 0, 'present at start: baseline');
  alerts = [];
  await c.checkAlerts();
  alerts = [{ text: 'AC: offline', severity: 'err', view: 'devices' }];
  await c.checkAlerts();
  assert.equal(app.length, 0, 'one poll is a flicker');
  await c.checkAlerts();
  assert.equal(app.length, 1);
  assert.equal(app[0].id, 'home.alert');
  assert.equal(app[0].route, '#/home/devices');
  await c.checkAlerts();
  assert.equal(app.length, 1, 'once per appearance');
});

test('module health: down after two misses, back once', async () => {
  const { c, app } = rig({ mods: [homeMod] });
  const m = c.registry.get('home');
  await c.checkHealth();
  m.status = 'unreachable'; await c.checkHealth();
  assert.equal(app.length, 0);
  await c.checkHealth();
  assert.equal(app.length, 1);
  assert.match(app[0].title, /Home is unreachable/);
  m.status = 'ready'; await c.checkHealth();
  assert.match(app[1].title, /Home is back/);
});

test('prefs are pushed to notify modules, signed, with defaults filled in', async () => {
  const { c, posts } = rig({ mods: [healthMod, homeMod], prefs: { types: { 'health.battery': { params: { threshold: 35 } } } } });
  await c.pushPrefs();
  const p = posts.filter((x) => x.prefsTo);
  assert.deepEqual(p.map((x) => x.prefsTo), ['health'], 'only modules that take notify');
  assert.equal(p[0].body.types['health.battery'].params.threshold, 35);
  assert.equal(p[0].body.types['health.illness'].discord, true);
  assert.equal(p[0].body.quiet.from, '23:00');
  assert.ok(p[0].headers['x-console-auth']);
  assert.equal(p[0].headers['x-console-module'], 'health');
});

test('Discord test goes to the named webhook; an app test reaches every client', async () => {
  const { c, posts, app } = rig({ mods: [] });
  const r = await c.testDiscord('env:default');
  assert.equal(r.ok, true);
  assert.match(posts[0].embeds[0].description, /This is a test/);
  assert.equal((await c.testDiscord('nope')).ok, false);
  c.testApp(2);
  assert.equal(app[0].id, 'console.test');
  assert.equal(c.missedSince(NOON - 1).length, 1);
});

test('overview alerts with a stable key are one alert while their words change; declared alert types are watched', async () => {
  const router = { id: 'router', manifest: { name: 'Router', capabilities: ['summary', 'sse'], notifications: [
    { id: 'router.data-plan', label: 'Data plan', severity: 'warn', defaultChannels: ['app'], source: 'alerts' },
  ] } };
  let pct = 90;
  const { c, app } = rig({ mods: [router], summaries: { router: () => ({ alerts: pct ? [{ text: `data plan ${pct}% used`, severity: 'warn', notify: 'router.data-plan', key: 'data-plan' }] : [] }) } });
  pct = 0; await c.checkAlerts();
  pct = 90; await c.checkAlerts(); pct = 91; await c.checkAlerts(); pct = 92; await c.checkAlerts();
  assert.equal(app.length, 1);
  assert.equal(app[0].id, 'router.data-plan');
  assert.equal(app[0].body, 'data plan 91% used');
});
