import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WidgetKeys, WidgetData, widgetAuth } from '../src/widgets.js';

const tmp = () => join(mkdtempSync(join(tmpdir(), 'wk-')), 'widget-keys.json');

test('a widget key is shown once, stored hashed, and verifies', () => {
  const file = tmp();
  const keys = new WidgetKeys({ file });
  const k = keys.create('Phone');
  assert.match(k.key, /^ojw_[A-Za-z0-9_-]{32}$/);
  const disk = readFileSync(file, 'utf8');
  assert.ok(!disk.includes(k.key), 'the key itself must never be written');
  assert.equal(keys.verify(k.key).id, k.id);
  assert.equal(keys.verify(`${k.key}x`), null);
  assert.equal(keys.verify('Bearer nonsense'), null);
  assert.equal(new WidgetKeys({ file }).verify(k.key).id, k.id, 'survives a restart');
  assert.ok(!('hash' in keys.list()[0]), 'list() never exposes the hash');
});

test('a revoked key stops working', () => {
  const keys = new WidgetKeys({ file: tmp() });
  const k = keys.create();
  assert.ok(keys.remove(k.id));
  assert.equal(keys.verify(k.key), null);
  assert.equal(keys.remove(k.id), false);
});

test('widgetAuth refuses a missing or wrong key', async () => {
  const keys = new WidgetKeys({ file: tmp() });
  const k = keys.create();
  const mw = widgetAuth(keys);
  const run = (auth) => new Promise((resolve) => {
    const req = { get: (h) => (h === 'authorization' ? auth : undefined) };
    const res = { status(c) { this.c = c; return this; }, json() { resolve(this.c); } };
    mw(req, res, () => resolve('next'));
  });
  assert.equal(await run(`Bearer ${k.key}`), 'next');
  assert.equal(await run('Bearer ojw_wrong'), 401);
  assert.equal(await run(undefined), 401);
});

function fakeRegistry(mods) {
  const list = Object.entries(mods).map(([id, m]) => ({
    id, name: id, origin: `http://${id}`, token: '', enabled: true, status: m.status || 'ready',
    reason: m.reason || null, manifest: { name: id, capabilities: ['summary'] },
  }));
  return { list: () => list, get: (id) => list.find((m) => m.id === id) };
}

function fakeFetch(routes, calls = []) {
  return async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : undefined, headers: opts.headers });
    const r = routes[`${opts.method || 'GET'} ${url}`];
    if (!r) return { ok: false, status: 404, json: async () => ({ error: 'nope' }) };
    return { ok: true, status: 200, json: async () => (typeof r === 'function' ? r(opts) : r) };
  };
}

const AC = { id: 'ac-1', name: 'Bedroom AC', room: 'Bedroom', available: true, state: { power: false, mode: 'cool', target_temperature: 26, indoor_temperature: 27.5, outdoor_temperature: 30 } };

test('widget data boils module summaries down and signs every call', async () => {
  const calls = [];
  const routes = {
    'GET http://home/api/summary': { status: 'ok', headline: '1 of 1 device online', model: { power: false, mode: 'cool', indoor: 27.5, target: 26, home: true } },
    'GET http://home/api/devices': [AC],
    'GET http://router/api/summary': { status: 'ok', headline: '5G NSA · excellent signal', lights: [{ id: 'internet', detail: 'online · 5G NSA' }, { id: 'data', detail: '69% of 440GB · 305 GB used · router alerts off' }], facts: [{ k: 'Signal', v: '-73 dBm · excellent' }, { k: 'Now', v: '2.1 Mb/s ↓' }], model: { bars: 5, clients: 3, connected: true } },
    'GET http://music/api/summary': { status: 'ok', headline: 'Paused', model: { connected: true, playing: false, title: 'Freezing Rain', artist: 'BONES', cover: '/api/cover?u=https%3A%2F%2Fi.scdn.co%2Fimage%2Fabc' } },
  };
  const wd = new WidgetData({ registry: fakeRegistry({ home: {}, router: {}, music: {}, fleet: { status: 'degraded', reason: 'timeout' } }), identitySecret: 's', fetchImpl: fakeFetch(routes, calls) });
  const d = await wd.get();
  assert.equal(d.home.indoor, 27.5);
  assert.equal(d.home.power, false);
  assert.equal(d.home.device.id, 'ac-1');
  assert.equal(d.router.usedPct, 69);
  assert.equal(d.router.capGb, 440);
  assert.equal(d.router.usedGb, 305);
  assert.equal(d.router.dbm, -73);
  assert.equal(d.router.network, '5G NSA');
  assert.equal(d.music.cover, 'https://i.scdn.co/image/abc');
  assert.equal(d.fleet, null, 'a module that is down gives no block');
  assert.equal(d.status, 'err');
  assert.ok(d.alerts.some((a) => a.module === 'fleet'));
  assert.ok(calls.every((c) => c.headers['x-console-auth'] && c.headers['x-console-module']));
  // cached
  const n = calls.length;
  await wd.get();
  assert.equal(calls.length, n);
});

test('setAc turns the AC on, off, and toggles from its current state', async () => {
  const calls = [];
  const routes = {
    'GET http://home/api/devices': [AC],
    'POST http://home/api/devices/ac-1/command': { ok: true },
  };
  const wd = new WidgetData({ registry: fakeRegistry({ home: {} }), identitySecret: 's', fetchImpl: fakeFetch(routes, calls) });
  assert.deepEqual(await wd.setAc(true), { ok: true, power: true, name: 'Bedroom AC' });
  assert.deepEqual(calls.at(-1).body, { power: true });
  await wd.setAc('toggle');
  assert.deepEqual(calls.at(-1).body, { power: true }, 'off → toggle → on');
  await wd.setAc(false);
  assert.deepEqual(calls.at(-1).body, { power: false });
});

test('setAc says so when there is no AC', async () => {
  const wd = new WidgetData({ registry: fakeRegistry({ home: {} }), identitySecret: 's', fetchImpl: fakeFetch({ 'GET http://home/api/devices': [] }) });
  const r = await wd.setAc(true);
  assert.equal(r.ok, false);
});
