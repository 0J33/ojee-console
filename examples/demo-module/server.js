#!/usr/bin/env node
/**
 * demo-module — the reference implementation of the console module contract.
 *
 * Around 150 lines, no dependencies, and it does everything a real module
 * does: serves a manifest, a health endpoint, a UI entry point, a JSON API and
 * an SSE stream. Copy this file to start a new module.
 *
 *   node examples/demo-module/server.js          # http://127.0.0.1:8199
 *
 * It is also what the console's DOM tests mount, so the contract is verified
 * on every run rather than only described in a README.
 *
 * Standalone vs mounted: a module never implements login. When mounted, the
 * console has already authenticated the caller and asserts who they are in
 * X-Console-User (signed — see src/modules/proxy.js). When run directly, the
 * headers are absent; a real module should refuse to bind to anything but
 * loopback or the tailnet in that case.
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8199);

const MANIFEST = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  // Each view becomes a nav entry in the console. `icon` names a <symbol> in
  // the shell sprite; a module may append its own on mount.
  views: [
    { id: 'status', label: 'Status', icon: 'i-gauge' },
    { id: 'log', label: 'Log', icon: 'i-log' },
  ],
  ui: '/ui/index.js',
  health: '/api/health',
  capabilities: ['sse'],
};

/** Fake device state so the demo has something live to show. */
const state = {
  startedAt: Date.now(),
  power: true,
  target: 24,
  reading: 23.4,
  events: [],
};

function log(message) {
  state.events.unshift({ at: Date.now(), message });
  state.events.length = Math.min(state.events.length, 50);
}
log('module started');

setInterval(() => {
  // Drift towards the setpoint when on, towards ambient when off.
  const goal = state.power ? state.target : 27;
  state.reading += (goal - state.reading) * 0.08 + (Math.random() - 0.5) * 0.06;
}, 1000);

const send = (res, code, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  // Who is calling. Mounted: asserted by the console and signed. Standalone:
  // absent. A production module should verify the signature with
  // verifyIdentity() from ojee-console/src/modules/proxy.js and refuse
  // unsigned requests from anything but loopback.
  const user = req.headers['x-console-user'] || 'standalone';

  if (path === '/module.json') return send(res, 200, MANIFEST);

  if (path === '/api/health') {
    // `ok: false` here is what makes the console mark the module DEGRADED
    // rather than ready — report the truth, with a reason a human can act on.
    return send(res, 200, {
      ok: true,
      uptime: Math.floor((Date.now() - state.startedAt) / 1000),
      user,
    });
  }

  if (path === '/api/state') {
    return send(res, 200, {
      power: state.power,
      target: state.target,
      reading: Number(state.reading.toFixed(1)),
      user,
      events: state.events.slice(0, 20),
    });
  }

  if (path === '/api/command' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let cmd = {};
      try { cmd = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'bad_json' }); }

      if (typeof cmd.power === 'boolean') {
        state.power = cmd.power;
        log(`${user} turned power ${cmd.power ? 'on' : 'off'}`);
      }
      if (typeof cmd.target === 'number') {
        // Clamp rather than reject: a slider that can emit an out-of-range
        // value is the caller's bug, and refusing mid-drag feels broken.
        state.target = Math.max(16, Math.min(30, Math.round(cmd.target)));
        log(`${user} set target to ${state.target}°C`);
      }
      send(res, 200, { ok: true, power: state.power, target: state.target });
    });
    return;
  }

  if (path === '/api/events') {
    // SSE. No compression, headers flushed immediately, and a heartbeat so an
    // idle proxy does not decide the connection is dead.
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.flushHeaders?.();
    req.socket.setNoDelay(true);

    const push = () => res.write(`data: ${JSON.stringify({
      reading: Number(state.reading.toFixed(1)),
      power: state.power,
      target: state.target,
      at: Date.now(),
    })}\n\n`);

    push();
    const tick = setInterval(push, 2000);
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => { clearInterval(tick); clearInterval(beat); });
    return;
  }

  if (path === '/ui/index.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
    return res.end(readFileSync(join(HERE, 'ui.js')));
  }

  // ── standalone shell ───────────────────────────────────────────────
  // Everything above is what the console consumes. Everything below is
  // what makes the module usable WITHOUT the console: its own copy of
  // the design system plus ojee-ui's generic standalone shell, which
  // reads /module.json and mounts /ui/index.js through the same
  // ModuleHost the console uses.
  //
  // This is about twenty lines, and it is the whole reason "runs
  // standalone" is a testable claim rather than a README promise.
  const STATIC = {
    '/': ['public/index.html', 'text/html; charset=utf-8'],
    '/index.html': ['public/index.html', 'text/html; charset=utf-8'],
    '/ojee-ui.css': ['public/ojee-ui.css', 'text/css; charset=utf-8'],
    '/chrome.js': ['public/chrome.js', 'text/javascript; charset=utf-8'],
    '/favicon.svg': ['public/favicon.svg', 'image/svg+xml'],
  };
  const hit = STATIC[path];
  if (hit) {
    try {
      const body = readFileSync(join(HERE, hit[0]));
      res.writeHead(200, { 'content-type': hit[1], 'cache-control': 'no-cache' });
      return res.end(body);
    } catch {
      return send(res, 500, { error: 'shell_missing', detail: `${hit[0]} — run scripts/sync-ui.sh` });
    }
  }

  send(res, 404, { error: 'not_found', path });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`demo-module on http://127.0.0.1:${PORT}`);
  console.log(`  manifest  http://127.0.0.1:${PORT}/module.json`);
});
