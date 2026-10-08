/**
 * The notification center — one place that decides where every notification
 * goes.
 *
 * Modules decide WHEN something is worth saying. They say it as an event on
 * their own /api/events stream:
 *
 *     event: notify
 *     data: { id, title, body, tag, severity, view, at }
 *
 * and they list what they can say in module.json (`notifications: [...]`,
 * capability `notify`). The console holds one server-side subscription to
 * each such module, and this file decides WHERE each event goes — with the
 * person's settings, quiet hours and cooldowns from Settings → Notifications:
 *
 *   app       every open console (phone app, desktop app, browser tab) over
 *             /api/notify/stream; each shows it the way its platform can
 *   discord   a webhook, sent from here (server side, the URL never leaves)
 *
 * Modules that never learned the contract are still covered: what they raise
 * on the overview (`alerts` in /api/summary) is watched, and an alert that
 * appears — and is still there a poll later — becomes a notification of the
 * type `<module>.alert`.
 *
 * Settings flow the other way too: each notify-capable module is POSTed the
 * effective settings for its own types (/api/notify/prefs), so a module that
 * schedules things (Health's morning time, its work hours) reads them, and a
 * module that has to keep sending by itself when the console is out of reach
 * (the Claude runner on the laptop) applies the same choices.
 */

import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { decide, effective, SEVERITIES } from './policy.js';
import { signIdentity } from '../modules/proxy.js';

/** The console's own notifications. */
export const CONSOLE_TYPES = [
  {
    id: 'console.module-down', label: 'A module stopped responding',
    description: 'A module that was up has failed two health checks in a row (about 40 s). Also says when it is back.',
    severity: 'warn', defaultChannels: ['app'], cooldownMin: 15,
  },
];

/** What a module's overview alerts are about, where the console knows. */
const ALERT_HINTS = {
  home: 'A device unavailable — the AC not answering, a hub offline.',
  peripherals: 'A mouse or keyboard battery low, or a device plugged in but not answering.',
  music: 'Spotify not connected.',
  remote: 'Anything the gateway raises (machines being off is expected on a dual-boot pair and is not an alert).',
  router: 'The router offline, no mobile service, a refused password, the data plan near its limit.',
  agent: 'Claude sessions waiting or failed, the Assistant waiting, stack services stopped, n8n runs failing.',
  fleet: 'A machine degraded or in trouble.',
};

const sevOf = (s) => (SEVERITIES.includes(s) ? s : s === 'err' ? 'warn' : s === 'warn' ? 'warn' : 'info');

function validType(t, moduleId) {
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id.startsWith(`${moduleId}.`)) return null;
  if (!/^[a-z][a-z0-9-]{0,31}\.[a-z0-9.-]{1,48}$/.test(t.id)) return null;
  return {
    id: t.id,
    label: String(t.label || t.id).slice(0, 80),
    description: String(t.description || '').slice(0, 400),
    note: t.note ? String(t.note).slice(0, 400) : null,
    severity: SEVERITIES.includes(t.severity) ? t.severity : 'info',
    defaultChannels: Array.isArray(t.defaultChannels) ? t.defaultChannels.filter((c) => c === 'app' || c === 'discord') : ['app'],
    cooldownMin: Number.isFinite(t.cooldownMin) ? t.cooldownMin : undefined,
    view: typeof t.view === 'string' && /^[a-z0-9-]{1,32}$/.test(t.view) ? t.view : null,
    discordBy: t.discordBy === 'module' ? 'module' : 'console',
    // Raised as an overview alert (with `notify: <this id>`) rather than as
    // an event: the console watches the module's summary for it.
    fromAlerts: t.source === 'alerts',
    params: Array.isArray(t.params) ? t.params.filter((p) => p && /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(p.key || '')
      && ['time', 'number', 'weekday', 'weekdays', 'boolean'].includes(p.type)).slice(0, 8) : [],
  };
}

export class NotifyCenter extends EventEmitter {
  /**
   * @param {object} o
   * @param {import('../modules/registry.js').ModuleRegistry} o.registry
   * @param {import('./prefs.js').PrefsStore} o.prefs
   * @param {string} o.identitySecret
   * @param {string} o.publicOrigin    for "open in console" links in Discord
   * @param {string} o.tz
   */
  constructor({ registry, prefs, identitySecret, publicOrigin = '', tz = process.env.TIMEZONE || process.env.TZ, fetchImpl = fetch, now = () => Date.now(), log = (m) => console.log(m) }) {
    super();
    this.setMaxListeners(100);
    this.registry = registry;
    this.prefs = prefs;
    this.identitySecret = identitySecret;
    this.publicOrigin = publicOrigin;
    this.tz = tz;
    this.fetch = fetchImpl;
    this.now = now;
    this.log = log;
    this.last = new Map();          // policy cooldowns
    this.history = [];              // newest first
    this.links = new Map();         // moduleId -> subscription
    this.alerts = new Map();        // moduleId -> { seen: Map<text, count>, baseline }
    this.health = new Map();        // moduleId -> { ready, misses, announced }
    this.pushedAt = new Map();      // moduleId -> ms
    this.timers = [];
    this.seq = 0;
  }

  /* ── catalogue ───────────────────────────────────────────────────── */

  catalogue() {
    const groups = [{ module: 'console', name: 'Console', icon: 'i-cog', status: 'ready', types: CONSOLE_TYPES.map((t) => ({ ...t, discordBy: 'console', params: [], view: null, note: null })) }];
    for (const m of this.registry.list()) {
      if (!m.enabled || !m.manifest) continue;
      const caps = m.manifest.capabilities || [];
      const declared = Array.isArray(m.manifest.notifications) ? m.manifest.notifications.map((t) => validType(t, m.id)).filter(Boolean) : [];
      const types = [...declared];
      if (caps.includes('notify') && !types.some((t) => t.id === `${m.id}.other`)) {
        types.push({ id: `${m.id}.other`, label: 'Anything else it sends', description: 'A notification from this module that is not one of the types above.', severity: 'info', defaultChannels: ['app'], discordBy: 'console', params: [], view: null, note: null });
      }
      // Overview alerts become notifications for modules that do not have
      // their own — and for any module that asks for it by name.
      if (caps.includes('summary') && !declared.length && !types.some((t) => t.id === `${m.id}.alert`)) {
        types.unshift({
          id: `${m.id}.alert`, label: 'Overview alerts',
          description: `What this module flags on the overview. ${ALERT_HINTS[m.id] || ''}`.trim(),
          note: 'Sent when an alert appears and is still there a minute later; checked every minute.',
          severity: 'warn', defaultChannels: ['app'], discordBy: 'console', params: [], view: null,
        });
      }
      if (!types.length) continue;
      groups.push({
        module: m.id,
        name: m.manifest.name || m.name,
        icon: /^i-[a-z0-9-]+$/.test(m.manifest.icon || '') ? m.manifest.icon : 'i-box',
        status: m.status,
        notify: caps.includes('notify'),
        moduleTest: Array.isArray(m.manifest.notifyTest) ? m.manifest.notifyTest.filter((x) => typeof x === 'string').slice(0, 4) : [],
        types,
      });
    }
    return groups;
  }

  typeById(id) {
    for (const g of this.catalogue()) for (const t of g.types) if (t.id === id) return { group: g, type: t };
    return null;
  }

  /* ── routing ─────────────────────────────────────────────────────── */

  /**
   * One event from a module (or the console itself).
   * @returns the history record
   */
  async handle(moduleId, raw) {
    if (!raw || typeof raw !== 'object' || !raw.title) return null;
    let found = raw.id ? this.typeById(String(raw.id)) : null;
    if (found && found.group.module !== moduleId && moduleId !== 'console') found = null;
    if (!found) found = this.typeById(`${moduleId}.other`) || this.typeById(`${moduleId}.alert`);
    if (!found) return null;
    const { group, type } = found;
    const ev = {
      key: `${Date.now().toString(36)}-${(this.seq += 1).toString(36)}`,
      id: type.id,
      module: moduleId,
      moduleName: group.name,
      title: String(raw.title).slice(0, 200),
      body: String(raw.body || '').slice(0, 1500),
      tag: String(raw.tag || type.id).slice(0, 120),
      severity: SEVERITIES.includes(raw.severity) ? raw.severity : type.severity,
      route: this.#route(moduleId, raw, type),
      at: this.now(),
    };
    const prefs = this.prefs.get();
    const d = decide(prefs, type, ev, { now: ev.at, tz: this.tz, last: this.last });
    const eff = effective(prefs, type);
    const rec = { ...ev, label: type.label };
    if (d.why) {
      rec.app = eff.app ? d.why : 'off';
      rec.discord = eff.discord ? d.why : 'off';
    } else {
      rec.app = eff.app ? 'sent' : 'off';
      rec.discord = !eff.discord ? 'off' : type.discordBy === 'module' ? 'by module' : 'pending';
    }
    if (d.app) this.emit('app', ev);
    this.#remember(rec);
    if (d.discord && type.discordBy !== 'module') {
      const hook = this.prefs.webhookFor(moduleId);
      if (!hook) rec.discord = 'no webhook';
      else {
        const r = await this.sendDiscord(hook.url, ev);
        rec.discord = r.ok ? 'sent' : `failed (${r.status || r.error})`;
      }
      this.emit('history', rec);
    }
    return rec;
  }

  #route(moduleId, raw, type) {
    if (typeof raw.route === 'string' && /^#\/[A-Za-z0-9_\-/]*$/.test(raw.route)) return raw.route;
    const view = typeof raw.view === 'string' && /^[a-z0-9-]{1,32}$/.test(raw.view) ? raw.view : type.view;
    if (moduleId === 'console') return raw.module ? `#/${raw.module}` : '#/';
    return `#/${moduleId}${view ? `/${view}` : ''}`;
  }

  #remember(rec) {
    this.history.unshift(rec);
    if (this.history.length > 100) this.history.length = 100;
    this.emit('history', rec);
  }

  /** Events from the last `ms` that went to the app, newest last (a client catching up). */
  missedSince(since, ms = 2 * 3_600_000, max = 5) {
    const floor = Math.max(since, this.now() - ms);
    return this.history.filter((r) => r.at > floor && r.app === 'sent').slice(0, max).reverse();
  }

  async sendDiscord(url, ev, { test = false } = {}) {
    const colors = { info: 0x8a8a8a, warn: 0xd1a03a, critical: 0xe05555 };
    const link = this.publicOrigin && ev.route ? `${this.publicOrigin}/${ev.route}` : null;
    const body = {
      username: test ? 'ojee console' : String(ev.moduleName || ev.module || 'ojee console').toLowerCase().slice(0, 32),
      embeds: [{
        title: ev.title.slice(0, 250),
        description: [ev.body, link ? `[Open in console](${link})` : ''].filter(Boolean).join('\n\n').slice(0, 3900),
        url: link || undefined,
        color: colors[ev.severity] ?? colors.info,
        footer: { text: `${ev.moduleName || ev.module}${ev.label ? ` · ${ev.label}` : ''}`.slice(0, 200) },
        timestamp: new Date(ev.at || this.now()).toISOString(),
      }],
    };
    try {
      const r = await this.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      // Never the URL in a log or a reply: it is a credential.
      return { ok: false, error: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || 'network') };
    }
  }

  /* ── tests from the page ─────────────────────────────────────────── */

  testApp(clients) {
    const ev = {
      key: `test-${Date.now().toString(36)}`, id: 'console.test', module: 'console', moduleName: 'Console', label: 'Test',
      title: 'Test notification', body: `Sent from Settings → Notifications to ${clients} open console${clients === 1 ? '' : 's'}. If you can read this here, app notifications work on this device.`,
      tag: `console.test:${Date.now()}`, severity: 'info', route: '#/settings/notifications', at: this.now(),
    };
    this.emit('app', ev);
    this.#remember({ ...ev, app: 'sent', discord: 'off' });
    return ev;
  }

  async testDiscord(webhookId) {
    const hook = this.prefs.webhookById(webhookId);
    if (!hook) return { ok: false, error: 'No such webhook' };
    const ev = {
      id: 'console.test', module: 'console', moduleName: 'Console', label: 'Test', severity: 'info', route: '#/settings/notifications', at: this.now(),
      title: 'Test from the ojee console', body: `This is a test, sent from Settings → Notifications to the webhook "${hook.name}". Nothing is wrong.`,
    };
    const r = await this.sendDiscord(hook.url, ev, { test: true });
    this.#remember({ ...ev, key: `test-${Date.now().toString(36)}`, tag: 'console.test', app: 'off', discord: r.ok ? 'sent' : `failed (${r.status || r.error})` });
    return r;
  }

  /** Ask a module to test its own sending (the runner's own webhook). */
  async testModule(moduleId, channel = 'discord') {
    const m = this.registry.get(moduleId);
    if (!m?.manifest) return { ok: false, error: 'module not ready' };
    const r = await this.#moduleRequest(m, '/api/notify/test', { channel });
    return r.ok ? { ok: true, ...(r.json || {}) } : { ok: false, error: r.error || `HTTP ${r.status}`, ...(r.json || {}) };
  }

  /* ── talking to modules (server to server, signed like the proxy) ─ */

  #headers(m) {
    const ts = String(Date.now());
    const user = 'console';
    return {
      'content-type': 'application/json',
      'x-console-user': user,
      'x-console-display': 'console',
      'x-console-module': m.id,
      'x-console-ts': ts,
      'x-console-auth': signIdentity({ user, moduleId: m.id, ts, secret: this.identitySecret }),
      ...(m.token ? { authorization: `Bearer ${m.token}` } : {}),
    };
  }

  async #moduleRequest(m, path, body, timeout = 10_000) {
    try {
      const r = await this.fetch(`${m.origin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: this.#headers(m), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      let json = null;
      try { json = await r.json(); } catch { /* not json */ }
      return { ok: r.ok, status: r.status, json };
    } catch (e) {
      return { ok: false, error: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.message) };
    }
  }

  /** The effective settings for one module's own types. */
  prefsFor(moduleId) {
    const p = this.prefs.get();
    const g = this.catalogue().find((x) => x.module === moduleId);
    const types = {};
    for (const t of g?.types || []) types[t.id] = effective(p, t);
    return { quiet: p.quiet, tz: this.tz || null, types };
  }

  async pushPrefs(only = null) {
    for (const m of this.registry.list()) {
      if (only && m.id !== only) continue;
      if (m.status !== 'ready' || !(m.manifest?.capabilities || []).includes('notify')) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await this.#moduleRequest(m, '/api/notify/prefs', this.prefsFor(m.id));
      if (r.ok) this.pushedAt.set(m.id, this.now());
    }
  }

  /* ── the module streams ──────────────────────────────────────────── */

  #subscribe(m) {
    const link = { req: null, timer: null, attempt: 0, lastAt: this.now(), closed: false, connected: false };
    this.links.set(m.id, link);
    const connect = () => {
      if (link.closed) return;
      const target = new URL(`/api/events?router=1&since=${link.lastAt}`, m.origin);
      const client = target.protocol === 'https:' ? https : http;
      let buf = '';
      const headers = { ...this.#headers(m), accept: 'text/event-stream' };
      delete headers['content-type'];
      const req = client.request(target, { method: 'GET', headers });
      link.req = req;
      const retry = () => {
        if (link.req !== req) return;
        link.req = null;
        link.connected = false;
        try { req.destroy(); } catch { /* gone */ }
        if (link.closed) return;
        const wait = Math.min(60_000, 2000 * 2 ** link.attempt);
        link.attempt += 1;
        link.timer = setTimeout(connect, wait);
        link.timer.unref?.();
      };
      // A stream that says nothing for 90 s (no event, no ping) is dead.
      let idle = null;
      const alive = () => { clearTimeout(idle); idle = setTimeout(retry, 90_000); idle.unref?.(); };
      req.on('response', (res) => {
        if (res.statusCode !== 200) { res.resume(); retry(); return; }
        link.attempt = 0;
        link.connected = true;
        alive();
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          alive();
          buf += chunk;
          let at;
          while ((at = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, at);
            buf = buf.slice(at + 2);
            let event = 'message';
            const data = [];
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
            }
            if (event !== 'notify' || !data.length) continue;
            try {
              const ev = JSON.parse(data.join('\n'));
              link.lastAt = Math.max(link.lastAt, Number(ev.at) || this.now());
              this.handle(m.id, ev).catch((e) => this.log(`  notify ${m.id}: ${e.message}`));
            } catch { /* a frame that is not JSON is not a notification */ }
          }
        });
        res.on('end', () => { clearTimeout(idle); retry(); });
        res.on('error', () => { clearTimeout(idle); retry(); });
      });
      req.on('error', () => { clearTimeout(idle); retry(); });
      req.end();
    };
    connect();
  }

  #unsubscribe(id) {
    const l = this.links.get(id);
    if (!l) return;
    l.closed = true;
    clearTimeout(l.timer);
    try { l.req?.destroy(); } catch { /* gone */ }
    this.links.delete(id);
  }

  /** Bring subscriptions in line with which modules are up and notify-capable. */
  syncLinks() {
    for (const m of this.registry.list()) {
      const want = m.enabled && m.status === 'ready' && (m.manifest?.capabilities || []).includes('notify') && !!m.origin;
      if (want && !this.links.has(m.id)) {
        this.#subscribe(m);
        this.pushPrefs(m.id).catch(() => {});
      }
      // A module that goes down keeps its link: the link retries on its own,
      // and dropping it would lose the `since` it resumes from.
    }
    for (const id of [...this.links.keys()]) {
      const m = this.registry.get(id);
      if (!m || !m.enabled) this.#unsubscribe(id);
    }
  }

  linkStatus() {
    return Object.fromEntries([...this.links].map(([id, l]) => [id, { connected: l.connected, prefsPushedAt: this.pushedAt.get(id) || null }]));
  }

  /* ── module health and overview alerts ───────────────────────────── */

  async checkHealth() {
    for (const m of this.registry.list()) {
      if (!m.enabled) continue;
      const ready = m.status === 'ready' || m.status === 'degraded';
      const h = this.health.get(m.id) || { ready: null, misses: 0, announced: false };
      if (h.ready === null) { this.health.set(m.id, { ready, misses: 0, announced: false }); continue; }
      if (ready) {
        if (h.announced) this.handle('console', { id: 'console.module-down', module: m.id, title: `${m.manifest?.name || m.name} is back`, body: 'The module is responding again.', tag: `module:${m.id}:up` }).catch(() => {});
        this.health.set(m.id, { ready: true, misses: 0, announced: false });
      } else {
        h.misses += 1;
        if (h.misses === 2 && !h.announced) {
          h.announced = true;
          this.handle('console', { id: 'console.module-down', module: m.id, title: `${m.manifest?.name || m.name} is unreachable`, body: m.reason || 'The module stopped responding.', tag: `module:${m.id}:down` }).catch(() => {});
        }
        h.ready = false;
        this.health.set(m.id, h);
      }
    }
  }

  async checkAlerts() {
    const cat = this.catalogue();
    for (const g of cat) {
      const watch = g.types.some((t) => t.id === `${g.module}.alert`) || g.types.some((t) => t.fromAlerts);
      if (!watch) continue;
      const m = this.registry.get(g.module);
      if (!m || m.status !== 'ready') continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await this.#moduleRequest(m, '/api/summary', undefined, 8000);
      if (!r.ok || !r.json) continue;
      const list = Array.isArray(r.json.alerts) ? r.json.alerts : [];
      const st = this.alerts.get(g.module) || { seen: new Map(), baseline: true };
      const now = new Map();
      for (const a of list) {
        const text = String(a?.text || '').slice(0, 300);
        if (!text) continue;
        // A module can give an alert a stable key, so one whose words change
        // (a data plan at 91%, then 92%) is still the same alert.
        const k = typeof a.key === 'string' && a.key ? `k:${a.key}` : text;
        const prev = st.seen.get(k);
        const count = (prev?.count || 0) + 1;
        now.set(k, { count, sent: prev?.sent || false });
        // Present on two polls in a row, and not already there when the
        // console started: a flicker is not news, and neither is a reboot.
        if (count === 2 && !st.baseline && !prev?.sent) {
          now.get(k).sent = true;
          const id = typeof a.notify === 'string' && a.notify.startsWith(`${g.module}.`) ? a.notify : `${g.module}.alert`;
          this.handle(g.module, { id, title: g.name, body: text, tag: `${id}:${k}`, severity: sevOf(a.severity), view: a.view }).catch(() => {});
        }
        if (st.baseline) now.get(k).sent = true;
      }
      this.alerts.set(g.module, { seen: now, baseline: false });
    }
  }

  /* ── lifecycle ───────────────────────────────────────────────────── */

  start() {
    const every = (ms, fn) => { const t = setInterval(() => { fn().catch?.(() => {}); }, ms); t.unref?.(); this.timers.push(t); };
    // The registry polls every 20 s; follow it.
    every(20_000, async () => { this.syncLinks(); await this.checkHealth(); });
    every(60_000, () => this.checkAlerts());
    every(10 * 60_000, () => this.pushPrefs());
    setTimeout(() => { this.syncLinks(); this.checkHealth(); this.checkAlerts().catch(() => {}); }, 3000).unref?.();
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const id of [...this.links.keys()]) this.#unsubscribe(id);
  }
}
