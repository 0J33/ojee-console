/* The 2026-11 notification policy: one item per stable key, hold-to-raise,
   clear-to-resolve, grouping, snooze, mute, quiet hours, digest, no replay. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inbox, itemKey, subjectOf, REGROUP_MS } from '../src/notify/inbox.js';
import { PrefsStore } from '../src/notify/prefs.js';
import { NotifyCenter } from '../src/notify/center.js';

const TZ = 'Africa/Cairo';
const NOON = Date.parse('2026-10-08T09:00:00Z');     // 12:00 Cairo
const NIGHT = Date.parse('2026-10-08T20:30:00Z');    // 23:30 Cairo
const MIN = 60_000;

const temp = { id: 'fleet.cpu-temp', label: 'CPU temperature', severity: 'critical', hold: 2, clearMin: 5, channel: 'toast' };
const types = new Map([[temp.id, temp]]);
const alert = (c, extra = {}) => ({ key: itemKey('fleet', temp.id, 'loq'), kind: temp.id, title: `LOQ CPU at ${c} °C`, severity: 'critical', route: '#/fleet', ...extra });

function inboxRig({ decide } = {}) {
  let clock = NOON;
  const notes = [];
  const ib = new Inbox({ now: () => clock, decide: decide || (() => ({ toast: true, discord: false, why: null })) });
  ib.on('notify', (n) => notes.push(n));
  return { ib, notes, at: (t) => { clock = t; }, tick: (ms) => { clock += ms; }, now: () => clock };
}

test('keys: a subject made from text keeps its identity while the numbers move', () => {
  assert.equal(subjectOf('LOQ CPU at 96 °C for 5 min'), subjectOf('LOQ CPU at 98.5 °C for 6 min'));
  assert.notEqual(subjectOf('LOQ CPU hot'), subjectOf('HP CPU hot'));
  assert.equal(itemKey('fleet', 'fleet.cpu-temp', 'loq'), 'fleet:cpu-temp:loq');
});

test('dedupe: changing numbers update the same item; one raise is one notification', () => {
  const { ib, notes } = inboxRig();
  ib.observeModule('fleet', [], types);          // the first look: nothing wrong
  ib.observeModule('fleet', [alert(96)], types);
  assert.equal(notes.length, 0, 'held: one check is not enough');
  ib.observeModule('fleet', [alert(97)], types);
  assert.equal(notes.length, 1);
  ib.observeModule('fleet', [alert(98)], types);
  ib.observeModule('fleet', [alert(99)], types);
  assert.equal(notes.length, 1, 'still the same item: no second notification');
  const snap = ib.snapshot();
  assert.equal(snap.open.length, 1);
  assert.equal(snap.open[0].title, 'LOQ CPU at 99 °C', 'the item carries the newest numbers');
});

test('flapping: an alert must be clear for clearMin before it resolves; a blip back keeps it one item', () => {
  const { ib, notes, tick } = inboxRig();
  ib.observeModule('fleet', [], types);
  ib.observeModule('fleet', [alert(96)], types);
  ib.observeModule('fleet', [alert(96)], types);
  assert.equal(notes.length, 1);
  for (let i = 0; i < 6; i += 1) {
    tick(MIN);
    ib.observeModule('fleet', i % 2 ? [alert(95)] : [], types);   // flapping around the threshold
  }
  assert.equal(ib.snapshot().open.length, 1, 'still open');
  assert.equal(notes.length, 1, 'flapping never re-raised');
  tick(MIN); ib.observeModule('fleet', [], types);
  tick(4 * MIN); ib.observeModule('fleet', [], types);
  assert.equal(ib.snapshot().open.length, 1, '4 minutes clear is not 5');
  tick(MIN); ib.observeModule('fleet', [], types);
  assert.equal(ib.snapshot().open.length, 0, 'resolved after 5 clear minutes');
  assert.equal(ib.snapshot().resolved.length, 1);
  assert.equal(notes.length, 1, 'resolving is silent');
});

test('a held alert that disappears before raising is forgotten, not resolved', () => {
  const { ib, notes } = inboxRig();
  ib.observeModule('fleet', [], types);
  ib.observeModule('fleet', [alert(96)], types);
  ib.observeModule('fleet', [], types);
  assert.equal(notes.length, 0);
  assert.equal(ib.snapshot().resolved.length, 0);
  assert.equal(ib.items.size, 0);
});

test('grouping: a raise soon after resolving reopens the item ×N; long after, it starts over', () => {
  const { ib, notes, tick } = inboxRig();
  ib.observeModule('fleet', [], types);
  const cycle = () => {
    ib.observeModule('fleet', [alert(97)], types); ib.observeModule('fleet', [alert(97)], types);
    tick(MIN); ib.observeModule('fleet', [], types); tick(6 * MIN); ib.observeModule('fleet', [], types);
  };
  cycle(); cycle(); cycle();
  ib.observeModule('fleet', [alert(97)], types); ib.observeModule('fleet', [alert(97)], types);
  const it = ib.snapshot().open[0];
  assert.equal(it.count, 4);
  assert.equal(it.countSince, NOON);
  assert.equal(notes.length, 4, 'each real raise notifies (policy cooldowns are the center\'s job)');
  tick(MIN); ib.observeModule('fleet', [], types); tick(6 * MIN); ib.observeModule('fleet', [], types);
  tick(REGROUP_MS + MIN);
  ib.observeModule('fleet', [alert(97)], types); ib.observeModule('fleet', [alert(97)], types);
  assert.equal(ib.snapshot().open[0].count, 1, 'a fresh episode');
});

test('snooze: hidden until it runs out, then back without a second notification; unsnooze undoes it', () => {
  const { ib, notes, tick } = inboxRig();
  ib.raise('agent', { kind: 'agent.question', title: 'forsa is asking', key: 'agent:question:forsa', blocking: true }, { id: 'agent.question', blocking: true });
  assert.equal(notes.length, 1);
  const key = 'agent:question:forsa';
  ib.snooze(key, 60);
  assert.equal(ib.snapshot().open.length, 0);
  assert.equal(ib.snapshot().snoozed.length, 1);
  ib.raise('agent', { kind: 'agent.question', title: 'forsa is still asking', key }, { id: 'agent.question', blocking: true });
  assert.equal(notes.length, 1, 'a re-sent raise of a snoozed open item is an update');
  assert.equal(ib.snapshot().open.length, 0, 'and it stays snoozed');
  tick(61 * MIN);
  assert.equal(ib.snapshot().open.length, 1, 'back on schedule');
  assert.equal(notes.length, 1, 'silently');
  ib.snooze(key, 60); ib.unsnooze(key);
  assert.equal(ib.snapshot().open.length, 1, 'undo');
});

test('done: dismissed until raised again; undo reopens', () => {
  const { ib, notes } = inboxRig();
  const t = { id: 'agent.login' };
  ib.raise('agent', { kind: t.id, title: 'platform-3 needs login', key: 'k1' }, t);
  ib.dismiss('k1');
  assert.equal(ib.snapshot().open.length, 0);
  ib.undismiss('k1');
  assert.equal(ib.snapshot().open.length, 1);
  ib.dismiss('k1');
  ib.raise('agent', { kind: t.id, title: 'platform-3 needs login', key: 'k1' }, t);
  assert.equal(ib.snapshot().open.length, 1);
  assert.equal(notes.length, 2);
});

test('updates fold into the digest and never notify', () => {
  const { ib, notes } = inboxRig();
  ib.addUpdate('agent', { title: 'console-redesign finished' }, { id: 'agent.done' });
  ib.addUpdate('fleet', { title: 'backup finished' }, { id: 'fleet.backup' });
  assert.equal(notes.length, 0);
  assert.equal(ib.snapshot().updates.length, 2);
  assert.equal(ib.snapshot().open.length, 0);
});

test('no replay: a restarted console remembers what was already raised', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ojc-inbox-'));
  const file = join(dir, 'inbox.json');
  let clock = NOON;
  const notes = [];
  const a = new Inbox({ file, now: () => clock, decide: () => ({ toast: true }) });
  a.observeModule('fleet', [], types);
  a.observeModule('fleet', [alert(97)], types); a.observeModule('fleet', [alert(97)], types);
  a.save();
  const b = new Inbox({ file, now: () => clock, decide: () => ({ toast: true }) });
  b.on('notify', (n) => notes.push(n));
  b.observeModule('fleet', [alert(98)], types);
  b.observeModule('fleet', [alert(98)], types);
  assert.equal(notes.length, 0, 'already open before the restart: no toast');
  assert.equal(b.snapshot().open.length, 1);
  // A console that never ran: its first look is the baseline, silent.
  const c = new Inbox({ file: join(dir, 'new.json'), now: () => clock, decide: () => ({ toast: true }) });
  c.on('notify', (n) => notes.push(n));
  c.observeModule('fleet', [alert(97)], types);
  assert.equal(c.snapshot().open.length, 1);
  assert.equal(notes.length, 0);
});

/* ── the center's policy around it ─────────────────────────────────── */

function centerRig(prefs = {}) {
  let clock = NOON;
  const mod = { id: 'fleet', enabled: true, status: 'ready', origin: 'http://fleet', token: '', manifest: { name: 'Machines', capabilities: ['summary', 'notify'], notifications: [
    { ...temp, params: [{ key: 'celsius', type: 'number', default: 95, unit: '°C' }, { key: 'minutes', type: 'number', default: 5 }] },
    { id: 'fleet.disk', label: 'Disk filling', severity: 'warn' },
  ] } };
  const agent = { id: 'agent', enabled: true, status: 'ready', origin: 'http://agent', token: '', manifest: { name: 'Claude', capabilities: ['notify'], notifications: [
    { id: 'agent.question', label: 'Claude asks a question', severity: 'warn', blocking: true },
  ] } };
  const registry = { list: () => [mod, agent], get: (id) => ({ fleet: mod, agent }[id]) };
  const store = new PrefsStore({ file: null, env: {} });
  store.patch(prefs);
  const c = new NotifyCenter({ registry, prefs: store, identitySecret: 's', tz: TZ, now: () => clock, fetchImpl: async () => new Response('{}') });
  const app = [];
  c.on('app', (e) => app.push(e));
  return { c, app, store, at: (t) => { clock = t; } };
}

test('center: blocking toasts, everything else is inbox-only; quiet hours hold non-blocking, blocking breaks through', async () => {
  const { c, app, at } = centerRig();
  const q = await c.handle('agent', { id: 'agent.question', title: 'forsa is asking', key: 'forsa' });
  assert.equal(q.app, 'sent');
  const d = await c.handle('fleet', { id: 'fleet.disk', title: 'HP disk at 91%', key: 'hp', severity: 'warn' });
  assert.equal(d.app, 'inbox', 'non-blocking: inbox and badge, no toast');
  assert.equal(app.length, 1);
  at(NIGHT);
  c.prefs.patch({ types: { 'fleet.disk': { channel: 'toast' } } });
  const n = await c.handle('fleet', { id: 'fleet.disk', title: 'LOQ disk at 95%', key: 'loq', severity: 'warn' });
  assert.equal(n.app, 'quiet', 'a toast kind in quiet hours waits in the inbox');
  const nq = await c.handle('agent', { id: 'agent.question', title: 'pitvisor is asking', key: 'pit' });
  assert.equal(nq.app, 'sent', 'blocking breaks through');
  assert.equal(c.inboxSnapshot().open.length, 4, 'every raise is in the inbox either way');
  assert.equal(c.inboxSnapshot().quiet.active, true);
});

test('center: mute a kind from the inbox, undo restores what it was; muted items leave the list', async () => {
  const { c, app } = centerRig({ types: { 'fleet.disk': { channel: 'toast' } } });
  await c.handle('fleet', { id: 'fleet.disk', title: 'HP disk at 91%', key: 'hp', severity: 'warn' });
  assert.equal(app.length, 1);
  const m = c.mute('fleet.disk');
  assert.deepEqual(m, { kind: 'fleet.disk', prev: 'toast' });
  assert.equal(c.channelOf('fleet.disk'), 'off');
  const snap = c.inboxSnapshot();
  assert.equal(snap.open.length, 0, 'a muted kind is not on the list');
  assert.equal(snap.muted.length, 1);
  assert.equal(snap.muted[0].label, 'Disk filling');
  await c.handle('fleet', { id: 'fleet.disk', title: 'LOQ disk at 95%', key: 'loq', severity: 'warn' });
  assert.equal(app.length, 1, 'muted: no toast');
  c.unmute('fleet.disk', m.prev);
  assert.equal(c.channelOf('fleet.disk'), 'toast', 'undo puts back the choice it had');
  assert.equal(c.inboxSnapshot().open.length, 2);
  c.mute('fleet.disk'); c.unmute('fleet.disk', null);
  assert.equal(c.channelOf('fleet.disk'), 'inbox', 'undo of a default goes back to the default');
});

test('center: resolve and update states from module events', async () => {
  const { c, app } = centerRig();
  await c.handle('agent', { id: 'agent.question', title: 'forsa is asking', key: 'forsa' });
  assert.equal(c.inboxSnapshot().open.length, 1);
  const r = await c.handle('agent', { id: 'agent.question', key: 'forsa', state: 'resolve' });
  assert.equal(r.app, 'resolved');
  assert.equal(c.inboxSnapshot().open.length, 0);
  const u = await c.handle('fleet', { id: 'fleet.disk', title: 'Nightly backup finished', severity: 'info' });
  assert.equal(u.app, 'update');
  assert.equal(c.inboxSnapshot().updates.length, 1);
  assert.equal(app.length, 1);
});

test('center: declared params and blocking reach the catalogue (Settings lists every kind)', () => {
  const { c } = centerRig();
  const fleet = c.catalogue().find((g) => g.module === 'fleet');
  const t = fleet.types.find((x) => x.id === 'fleet.cpu-temp');
  assert.equal(t.channel, 'toast');
  assert.equal(t.hold, 2);
  assert.equal(t.params[0].unit, '°C');
  assert.ok(fleet.types.some((x) => x.id === 'fleet.alert'), 'other overview alerts are listed too');
  assert.equal(c.catalogue().find((g) => g.module === 'agent').types[0].blocking, true);
});
