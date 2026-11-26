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
import { decide, effective, inQuiet as inQuietNow, SEVERITIES, CHANNELS } from './policy.js';
import { Inbox, itemKey, subjectOf } from './inbox.js';
import { signIdentity } from '../modules/proxy.js';

/** The console's own notifications. */
export const CONSOLE_TYPES = [
  {
    id: 'console.module-down', label: 'A module stopped responding',
    description: 'A module that was up has failed two health checks in a row (about 40 s). The item resolves by itself when it answers again.',
    severity: 'warn', channel: 'inbox', defaultChannels: ['app'], cooldownMin: 15,
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
    // 2026-11: blocking kinds toast and push; everything else waits in the inbox.
    blocking: t.blocking === true,
    channel: CHANNELS.includes(t.channel) ? t.channel : undefined,
    discord: typeof t.discord === 'boolean' ? t.discord : undefined,
    hold: Number.isFinite(t.hold) ? Math.max(1, Math.min(20, Math.round(t.hold))) : undefined,
    clearMin: Number.isFinite(t.clearMin) ? Math.max(0, Math.min(240, t.clearMin)) : undefined,
    defaultChannels: Array.isArray(t.defaultChannels) ? t.defaultChannels.filter((c) => c === 'app' || c === 'discord') : ['app'],
    cooldownMin: Number.isFinite(t.cooldownMin) ? t.cooldownMin : undefined,
    view: typeof t.view === 'string' && /^[a-z0-9-]{1,32}$/.test(t.view) ? t.view : null,
    discordBy: t.discordBy === 'module' ? 'module' : 'console',
    // Raised as an overview alert (with `notify: <this id>`) rather than as
    // an event: the console watches the module's summary for it.
    fromAlerts: t.source === 'alerts',
    params: Array.isArray(t.params) ? t.params.filter((p) => p && /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(p.key || '')
      && ['time', 'number', 'weekday', 'weekdays', 'boolean'].includes(p.type)).slice(0, 8).map((p) => ({
      key: p.key, type: p.type, default: p.default,
      label: typeof p.label === 'string' ? p.label.slice(0, 40) : p.key,
      unit: typeof p.unit === 'string' ? p.unit.slice(0, 12) : undefined,
      min: Number.isFinite(p.min) ? p.min : undefined,
      max: Number.isFinite(p.max) ? p.max : undefined,
      step: Number.isFinite(p.step) ? p.step : undefined,
    })) : [],
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
  constructor({ registry, prefs, identitySecret, publicOrigin = '', tz = process.env.TIMEZONE || process.env.TZ, fetchImpl = fetch, now = () => Date.now(), log = (m) => console.log(m), push = null, inboxFile = null, quietOffline = new Set() }) {
    super();
    // Web Push (./push.js): the App channel for consoles that are not open.
    this.push = push;
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
    // Modules that are expected to be unreachable at times (on a laptop that
    // sleeps): their being down is shown quietly in the nav, never raised.
    this.quietOffline = quietOffline;
    this.inbox = new Inbox({ file: inboxFile, now: this.now, decide: (item, type) => this.#decideItem(item, type) });
    this.deliveries = new Set();
    this.inbox.on('notify', (n) => {
      const p = this.#deliver(n).catch((e) => this.log(`  notify deliver: ${e.message}`));
      this.deliveries.add(p);
      p.finally(() => this.deliveries.delete(p));
    });
    this.inbox.on('change', () => this.emit('inbox'));
  }

  /* ── the inbox ───────────────────────────────────────────────────── */

  /** 'toast' | 'inbox' | 'off' for a kind, from the person's settings. */
  channelOf(kind) {
    const found = this.typeById(kind);
    if (!found) return 'inbox';
    return effective(this.prefs.get(), found.type).channel;
  }

  inboxSnapshot() {
    const cache = new Map();
    const snap = this.inbox.snapshot((kind) => {
      if (!cache.has(kind)) cache.set(kind, this.channelOf(kind));
      return cache.get(kind);
    });
    const q = this.prefs.get().quiet;
    return { ...snap, quiet: { ...q, active: inQuietNow(q, this.now(), this.tz) } };
  }

  /** Whether one raise toasts (and pushes) and goes to Discord. */
  #decideItem(item, type) {
    const t = type || { id: item.kind, severity: 'warn' };
    const eff = effective(this.prefs.get(), t);
    if (eff.channel === 'off') return { toast: false, discord: false, why: 'muted', channel: 'off' };
    const ev = { tag: item.key, severity: item.severity, blocking: item.blocking };
    const d = decide(this.prefs.get(), t, ev, { now: this.now(), tz: this.tz, last: this.last });
    if (d.why) return { toast: false, discord: false, why: d.why, channel: eff.channel };
    return {
      toast: eff.channel === 'toast',
      discord: eff.discord && t.discordBy !== 'module',
      why: null,
      channel: eff.channel,
    };
  }

  /** One raise, delivered once to each channel it is due on. */
  async #deliver({ item, toast, discord: wantDiscord }) {
    let discord = wantDiscord;
    const ev = {
      key: item.key, id: item.kind, module: item.module, moduleName: item.moduleName, label: item.kindLabel,
      title: item.title, body: item.body, tag: item.key, severity: item.severity, blocking: item.blocking,
      route: item.route, action: item.action, count: item.count, at: this.now(),
    };
    const rec = { ...ev, app: toast ? 'sent' : 'inbox', discord: discord ? 'pending' : 'off' };
    if (toast) this.emit('app', ev);
    this.#remember(rec);
    if (this.localOnly) { discord = false; }
    const pushing = toast && !this.localOnly && this.push?.count()
      ? this.push.sendAll(ev).then((r) => { rec.push = r.summary; this.emit('history', rec); }, (e) => { rec.push = `push failed (${e.message})`; })
      : null;
    if (discord) {
      const hook = this.prefs.webhookFor(item.module === 'console' ? 'console' : item.module);
      if (!hook) rec.discord = 'no webhook';
      else {
        const r = await this.sendDiscord(hook.url, ev);
        rec.discord = r.ok ? 'sent' : `failed (${r.status || r.error})`;
      }
      this.emit('history', rec);
    }
    if (pushing) await pushing;
    return rec;
  }

  /** Wait for every delivery in flight (tests, and a clean shutdown). */
  async settled() { while (this.deliveries.size) await Promise.all([...this.deliveries]); }

  snooze(key, minutes) { return this.inbox.snooze(key, minutes); }
  unsnooze(key) { return this.inbox.unsnooze(key); }
  dismiss(key) { return this.inbox.dismiss(key); }
  clearResolved(key = null) { return this.inbox.clearResolved(key); }
  undismiss(key) { return this.inbox.undismiss(key); }

  /** Mute a kind (inbox "Mute this kind"); returns the channel it had, for Undo. */
  mute(kind) {
    const found = this.typeById(kind);
    if (!found) return null;
    const prev = this.prefs.get().types?.[kind]?.channel ?? null;
    this.prefs.patch({ types: { [kind]: { channel: 'off' } } });
    this.emit('inbox');
    return { kind, prev };
  }

  unmute(kind, prev = null) {
    const found = this.typeById(kind);
    if (!found) return false;
    // A concrete channel, never null: a kind switched off by the older page
    // ({ app: false }) would otherwise stay off. Setting a channel drops `app`.
    const fallback = effective({ types: {} }, found.type).channel;
    const channel = CHANNELS.includes(prev) && prev !== 'off' ? prev : fallback !== 'off' ? fallback : 'inbox';
    this.prefs.patch({ types: { [kind]: { channel } } });
    this.emit('inbox');
    return true;
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
      if (caps.includes('summary') && !types.some((t) => t.id === `${m.id}.alert`)) {
        const t = {
          id: `${m.id}.alert`, label: declared.length ? 'Other overview alerts' : 'Overview alerts',
          description: `What this module flags on the overview${declared.length ? ' that is not one of the kinds above' : ''}. ${declared.length ? '' : ALERT_HINTS[m.id] || ''}`.trim(),
          note: 'Raised when an alert holds for two checks (about a minute); resolved when it has been clear for 5 minutes.',
          severity: 'warn', defaultChannels: ['app'], discordBy: 'console', params: [], view: null,
        };
        if (declared.length) types.push(t); else types.unshift(t);
      }
      if (!types.length) continue;
      groups.push({
        module: m.id,
        name: m.label || m.manifest.name || m.name,
        icon: /^i-[a-z0-9-]+$/.test(m.manifest.icon || '') ? m.manifest.icon : 'i-box',
        status: m.status,
        quietOffline: this.quietOffline.has(m.id),
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
   *
   *   { id: '<module>.<kind>', title, body, severity, view|route, action,
   *     key?: '<subject>', state?: 'raise' | 'resolve' | 'update' }
   *
   * `raise` (the default for warn/critical and for blocking kinds) opens or
   * updates the item `module:kind:key`; `resolve` closes it; `update` (the
   * default for info) is one line in the digest. An item already open is
   * updated in place: a module re-sending "still waiting" is not a second
   * notification.
   * @returns a record: { id, key, app: 'sent'|'inbox'|'quiet'|'muted'|'open'|'update'|'resolved', discord }
   */
  async handle(moduleId, raw) {
    if (!raw || typeof raw !== 'object' || (!raw.title && raw.state !== 'resolve')) return null;
    let found = raw.id ? this.typeById(String(raw.id)) : null;
    if (found && found.group.module !== moduleId && moduleId !== 'console') found = null;
    if (!found) found = this.typeById(`${moduleId}.other`) || this.typeById(`${moduleId}.alert`);
    if (!found) return null;
    const { group, type } = found;
    const severity = SEVERITIES.includes(raw.severity) ? raw.severity : raw.severity === 'err' ? 'critical' : type.severity;
    const owner = moduleId === 'console' && raw.module ? String(raw.module) : moduleId;
    const subject = typeof raw.key === 'string' && raw.key ? raw.key.slice(0, 140) : (raw.tag ? String(raw.tag).slice(0, 140) : subjectOf(raw.title));
    const key = itemKey(moduleId === 'console' ? 'console' : moduleId, type.id, subject);
    const d = {
      kind: type.id,
      moduleName: moduleId === 'console' ? 'Console' : group.name,
      title: String(raw.title || '').slice(0, 200),
      body: String(raw.body || '').slice(0, 1500),
      severity,
      blocking: raw.blocking === true || type.blocking,
      route: this.#route(moduleId === 'console' ? 'console' : moduleId, { ...raw, module: owner }, type),
      action: typeof raw.action === 'string' ? raw.action.slice(0, 24) : undefined,
      key,
    };
    const state = ['raise', 'resolve', 'update'].includes(raw.state) ? raw.state
      : (d.blocking || severity !== 'info' ? 'raise' : 'update');
    const base = { id: type.id, key, module: moduleId, title: d.title, label: type.label, at: this.now() };
    if (state === 'resolve') {
      this.inbox.resolve(key);
      return { ...base, app: 'resolved', discord: 'off' };
    }
    if (state === 'update') {
      this.inbox.addUpdate(moduleId, d, type);
      return { ...base, app: 'update', discord: 'off' };
    }
    const { item, raised } = this.inbox.raise(moduleId === 'console' ? 'console' : moduleId, d, type);
    await this.settled();
    if (!raised) return { ...base, app: 'open', discord: 'off' };
    const dl = item.delivery || {};
    const sent = this.history.find((r) => r.key === key && r.at >= base.at);
    return {
      ...base,
      ...(sent?.push ? { push: sent.push } : {}),
      app: dl.why || (dl.toast ? 'sent' : 'inbox'),
      discord: dl.discord ? (type.discordBy === 'module' ? 'by module' : 'sent') : (type.discordBy === 'module' && effective(this.prefs.get(), type).discord ? 'by module' : 'off'),
      route: item.route,
    };
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

  async testApp(clients) {
    const devices = this.push?.count() || 0;
    const ev = {
      key: `test-${Date.now().toString(36)}`, id: 'console.test', module: 'console', moduleName: 'Console', label: 'Test',
      title: 'Test notification', body: `Sent from Settings → Notifications to ${clients} open console${clients === 1 ? '' : 's'}${devices ? ` and ${devices} push device${devices === 1 ? '' : 's'}` : ''}. If you can read this here, app notifications work on this device.`,
      tag: `console.test:${Date.now()}`, severity: 'info', route: '#/settings/notifications', at: this.now(),
    };
    this.emit('app', ev);
    const rec = { ...ev, app: 'sent', discord: 'off' };
    this.#remember(rec);
    if (devices) {
      const r = await this.push.sendAll(ev);
      rec.push = r.summary;
      this.emit('history', rec);
      return { ev, push: r };
    }
    return { ev, push: null };
  }

  /** A test to one push device, from its row on the page. */
  async testPush(id) {
    const s = this.push?.subs.find((x) => x.id === id);
    if (!s) return { ok: false, error: 'No such device' };
    const ev = {
      key: `test-${Date.now().toString(36)}`, id: 'console.test', module: 'console', moduleName: 'Console', label: 'Test',
      title: 'Test notification', body: `Sent to "${s.label}" by Web Push. It arrives even when the console is closed.`,
      tag: `console.test:${id}`, severity: 'info', route: '#/settings/notifications', at: this.now(),
    };
    const r = await this.push.sendAll(ev, { only: [id] });
    this.#remember({ ...ev, app: 'push only', discord: 'off', push: r.summary });
    const one = r.results[0] || {};
    return { ok: !!one.ok, status: one.status || null, error: one.ok ? null : (one.error || null), gone: !!one.gone };
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
      const key = itemKey('console', 'console.module-down', m.id);
      if (h.ready === null) { this.health.set(m.id, { ready, misses: 0, announced: false }); continue; }
      if (ready) {
        // Back: the item resolves, silently. "X is back" is not news worth a buzz.
        if (h.announced) this.inbox.resolve(key);
        this.health.set(m.id, { ready: true, misses: 0, announced: false });
      } else {
        h.misses += 1;
        if (h.misses === 2 && !h.announced && !this.quietOffline.has(m.id)) {
          h.announced = true;
          // eslint-disable-next-line no-await-in-loop
          await this.handle('console', { id: 'console.module-down', module: m.id, key: m.id, title: `${m.manifest?.name || m.name} is not responding`, body: m.reason || 'The module stopped responding.', severity: 'warn', action: 'Open' });
        }
        h.ready = false;
        this.health.set(m.id, h);
      }
    }
  }

  /**
   * Every module's overview alerts, through the inbox's hold-to-raise and
   * clear-to-resolve. An alert may carry `key` (stable subject), `notify`
   * (its kind), `title`/`body`, `action`, `view`/`route`. Without a key the
   * subject is the text with its numbers masked, so "98 °C" and "99 °C" are
   * the same alert.
   */
  async checkAlerts() {
    const cat = this.catalogue();
    for (const g of cat) {
      if (g.module === 'console') continue;
      const m = this.registry.get(g.module);
      if (!m || m.status !== 'ready' || !(m.manifest?.capabilities || []).includes('summary')) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await this.#moduleRequest(m, '/api/summary', undefined, 8000);
      if (!r.ok || !r.json) continue;
      const list = Array.isArray(r.json.alerts) ? r.json.alerts : [];
      const types = new Map(g.types.map((t) => [t.id, t]));
      const alerts = [];
      for (const a of list) {
        const text = String(a?.title || a?.text || '').slice(0, 300);
        if (!text) continue;
        const kind = typeof a.notify === 'string' && types.has(a.notify) ? a.notify
          : typeof a.kind === 'string' && types.has(`${g.module}.${a.kind}`) ? `${g.module}.${a.kind}` : `${g.module}.alert`;
        const subject = typeof a.key === 'string' && a.key ? a.key : subjectOf(text);
        const type = types.get(kind);
        alerts.push({
          key: itemKey(g.module, kind, subject),
          kind,
          title: text,
          body: String(a.body || (a.title && a.text && a.text !== a.title ? a.text : '') || '').slice(0, 600),
          severity: a.severity === 'err' ? 'critical' : SEVERITIES.includes(a.severity) ? a.severity : sevOf(a.severity),
          blocking: a.blocking === true || !!type?.blocking,
          route: this.#route(g.module, a, type || {}),
          action: typeof a.action === 'string' ? a.action.slice(0, 24) : undefined,
        });
      }
      this.inbox.observeModule(g.module, alerts, types, { moduleName: g.name });
      // eslint-disable-next-line no-await-in-loop
      await this.settled();
    }
  }

  /* ── lifecycle ───────────────────────────────────────────────────── */

  /**
   * NOTIFY=local (development in front of live modules): read-only. Polls
   * summaries and health into the inbox and streams it to open consoles, but
   * never subscribes to module streams, never posts settings to modules, and
   * never sends Discord or Web Push.
   */
  startLocal() {
    this.localOnly = true;
    const every = (ms, fn) => { const t = setInterval(() => { fn().catch?.(() => {}); }, ms); t.unref?.(); this.timers.push(t); };
    every(20_000, () => this.checkHealth());
    every(30_000, () => this.checkAlerts());
    setTimeout(() => { this.checkHealth(); this.checkAlerts().catch(() => {}); }, 2000).unref?.();
  }

  start() {
    const every = (ms, fn) => { const t = setInterval(() => { fn().catch?.(() => {}); }, ms); t.unref?.(); this.timers.push(t); };
    // The registry polls every 20 s; follow it.
    every(20_000, async () => { this.syncLinks(); await this.checkHealth(); });
    every(30_000, () => this.checkAlerts());
    every(10 * 60_000, () => this.pushPrefs());
    setTimeout(() => { this.syncLinks(); this.checkHealth(); this.checkAlerts().catch(() => {}); }, 3000).unref?.();
  }

  stop() {
    try { this.inbox.save(); } catch { /* best effort */ }
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const id of [...this.links.keys()]) this.#unsubscribe(id);
  }
}
