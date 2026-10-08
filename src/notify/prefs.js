/**
 * Notification settings, kept server-side so every device agrees.
 *
 *   DATA_DIR/notifications.json   (mode 0600 — it holds webhook URLs)
 *   {
 *     quiet:   { on, from: 'HH:MM', to: 'HH:MM', critical: bool },
 *     discord: { default: '<webhook id>', modules: { <moduleId>: '<webhook id>' } },
 *     webhooks: [{ id, name, url }],          // added on the page
 *     types:   { <typeId>: { app, discord, cooldownMin, params } },
 *   }
 *
 * Webhooks also come from the environment, so the URLs already configured on
 * the box keep working without anyone pasting them again:
 *
 *   NOTIFY_DISCORD_WEBHOOK                  -> id "env:default"
 *   NOTIFY_DISCORD_WEBHOOK_<NAME>=<url>     -> id "env:<name>"
 *
 * A webhook URL is a credential: anyone holding it can post as you. It is
 * never sent to the browser (the page sees a name and the last four
 * characters) and never logged.
 */

import { readFileSync, writeFileSync, renameSync, chmodSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { toMin } from './policy.js';

const WEBHOOK_RE = /^https:\/\/(?:[a-z0-9-]+\.)?(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;

export const DEFAULTS = {
  quiet: { on: true, from: '23:00', to: '07:00', critical: true },
  discord: { default: null, modules: {} },
  webhooks: [],
  types: {},
};

export function envWebhooks(env = process.env) {
  const out = [];
  if (env.NOTIFY_DISCORD_WEBHOOK) out.push({ id: 'env:default', name: 'Default (from the environment)', url: env.NOTIFY_DISCORD_WEBHOOK.trim(), source: 'env' });
  for (const [k, v] of Object.entries(env)) {
    const m = /^NOTIFY_DISCORD_WEBHOOK_([A-Z0-9_]+)$/.exec(k);
    if (!m || !v) continue;
    const name = m[1].toLowerCase();
    out.push({ id: `env:${name}`, name: `${name[0].toUpperCase()}${name.slice(1)} (from the environment)`, url: v.trim(), source: 'env' });
  }
  return out.filter((w) => w.url);
}

const hint = (url) => `…${String(url).slice(-4)}`;
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

function cleanParams(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(raw).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 40);
    else if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 12)).slice(0, 7);
  }
  return out;
}

/** Whatever was stored or sent, made valid. Unknown keys are dropped. */
export function normalize(raw = {}, base = DEFAULTS) {
  const s = JSON.parse(JSON.stringify(base));
  if (!raw || typeof raw !== 'object') return s;
  if (raw.quiet && typeof raw.quiet === 'object') {
    const q = raw.quiet;
    if ('on' in q) s.quiet.on = !!q.on;
    if (toMin(q.from) !== null) s.quiet.from = String(q.from).padStart(5, '0');
    if (toMin(q.to) !== null) s.quiet.to = String(q.to).padStart(5, '0');
    if ('critical' in q) s.quiet.critical = !!q.critical;
  }
  if (raw.discord && typeof raw.discord === 'object') {
    if ('default' in raw.discord) s.discord.default = typeof raw.discord.default === 'string' ? raw.discord.default.slice(0, 64) : null;
    if (raw.discord.modules && typeof raw.discord.modules === 'object') {
      s.discord.modules = {};
      for (const [m, id] of Object.entries(raw.discord.modules)) {
        if (/^[a-z][a-z0-9-]{0,31}$/.test(m) && typeof id === 'string' && id) s.discord.modules[m] = id.slice(0, 64);
      }
    }
  }
  if (Array.isArray(raw.webhooks)) {
    s.webhooks = raw.webhooks
      .filter((w) => w && typeof w.url === 'string' && WEBHOOK_RE.test(w.url.trim()))
      .map((w) => ({ id: /^w[a-f0-9]{6,}$/.test(w.id || '') ? w.id : `w${randomBytes(4).toString('hex')}`, name: String(w.name || 'Webhook').slice(0, 40), url: w.url.trim() }))
      .slice(0, 10);
  }
  if (raw.types && typeof raw.types === 'object') {
    s.types = { ...s.types };
    for (const [id, t] of Object.entries(raw.types)) {
      if (!/^[a-z][a-z0-9-]{0,31}\.[a-z0-9.-]{1,48}$/.test(id) || !t || typeof t !== 'object') continue;
      const cur = s.types[id] || {};
      const next = { ...cur };
      if (typeof t.app === 'boolean') next.app = t.app;
      if (typeof t.discord === 'boolean') next.discord = t.discord;
      if (t.cooldownMin === null) delete next.cooldownMin;
      else if (t.cooldownMin !== undefined) next.cooldownMin = clampInt(t.cooldownMin, 0, 1440, 5);
      const p = cleanParams(t.params);
      if (p) next.params = { ...(cur.params || {}), ...p };
      s.types[id] = next;
    }
  }
  return s;
}

export class PrefsStore {
  constructor({ file, env = process.env }) {
    this.file = file;
    this.env = env;
    this.data = normalize({});
    if (file && existsSync(file)) {
      try { this.data = normalize(JSON.parse(readFileSync(file, 'utf8'))); } catch { /* a broken file starts over from defaults */ }
    }
  }

  get() { return this.data; }

  save() {
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    try { chmodSync(this.file, 0o600); } catch { /* best effort */ }
  }

  /** Merge a partial update from the page. Webhooks are added/removed one at a time. */
  patch(p = {}) {
    const rest = { ...(p || {}) };
    delete rest.webhooks;
    // A module's webhook is merged in, and null puts it back on the default.
    if (rest.discord?.modules) rest.discord = { ...rest.discord, modules: { ...this.data.discord.modules, ...rest.discord.modules } };
    this.data = normalize(rest, this.data);
    this.save();
    return this.data;
  }

  addWebhook({ name, url }) {
    const u = String(url || '').trim();
    if (!WEBHOOK_RE.test(u)) throw Object.assign(new Error('That is not a Discord webhook URL (https://discord.com/api/webhooks/<id>/<token>).'), { status: 400 });
    const w = { id: `w${randomBytes(4).toString('hex')}`, name: String(name || 'Webhook').trim().slice(0, 40) || 'Webhook', url: u };
    this.data.webhooks = [...this.data.webhooks, w].slice(-10);
    if (!this.data.discord.default) this.data.discord.default = w.id;
    this.save();
    return w.id;
  }

  removeWebhook(id) {
    const before = this.data.webhooks.length;
    this.data.webhooks = this.data.webhooks.filter((w) => w.id !== id);
    if (this.data.discord.default === id) this.data.discord.default = null;
    for (const [m, v] of Object.entries(this.data.discord.modules)) if (v === id) delete this.data.discord.modules[m];
    this.save();
    return this.data.webhooks.length !== before;
  }

  /** Every webhook, env first. Full URLs — server side only. */
  webhooks() { return [...envWebhooks(this.env), ...this.data.webhooks.map((w) => ({ ...w, source: 'saved' }))]; }

  /** The webhook a module's Discord messages go to, or null. */
  webhookFor(moduleId) {
    const all = this.webhooks();
    const want = this.data.discord.modules[moduleId] || this.data.discord.default;
    return all.find((w) => w.id === want) || all.find((w) => w.id === 'env:default') || all[0] || null;
  }

  webhookById(id) { return this.webhooks().find((w) => w.id === id) || null; }

  /** What the page may see. */
  publicView() {
    const d = this.data;
    return {
      quiet: d.quiet,
      discord: { default: d.discord.default, modules: d.discord.modules },
      webhooks: this.webhooks().map((w) => ({ id: w.id, name: w.name, source: w.source, hint: hint(w.url) })),
      types: d.types,
    };
  }
}

export { WEBHOOK_RE };
