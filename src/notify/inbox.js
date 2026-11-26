/**
 * The inbox — one list of things that need you, shared by every device.
 *
 * Every alert from every module lands here as ONE item with a STABLE KEY
 * (`module:kind:subject`), never identified by its text: "LOQ CPU at 96 °C"
 * and "LOQ CPU at 98 °C" are the same item with a new number. Toasts, Web
 * Push, Discord and the overview's Needs-you list are views of these items,
 * so one event is one notification however many places show it.
 *
 * Two kinds of input:
 *
 *   observe/sweep  alerts a module states on every poll (/api/summary
 *                  `alerts`). An alert must HOLD for `hold` checks before it
 *                  raises, and must be CLEAR for `clearMin` minutes before it
 *                  resolves — so a value flapping around a threshold is one
 *                  item, not a stream of them. Resolving is silent.
 *   raise/resolve  explicit events a module sends (`event: notify` with
 *                  `state: raise|resolve`). Those are already debounced by
 *                  the module and act immediately.
 *
 * A raise of an item that resolved a while ago (inside REGROUP_MS) reopens
 * it with a count — "×4 since 16:38" — instead of making a new one.
 *
 * Whether a raise TOASTS (and pushes, and goes to Discord) is decided by the
 * `decide` callback the center passes in (policy.js + the person's settings).
 * Items of a muted kind are kept, quietly: they show as one "Muted" line in
 * the inbox and never on the overview.
 *
 * Informational events (a session finished, a backup ran) are not items:
 * they fold into a digest line, "5 updates".
 */

import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

export const REGROUP_MS = 6 * 3_600_000;
const RESOLVED_KEEP_MS = 12 * 3_600_000;
const UPDATES_KEEP_MS = 24 * 3_600_000;
const MAX_ITEMS = 300;
const MAX_UPDATES = 60;

/** Digits become '#', so a subject made from text keeps its identity while numbers move. */
export const subjectOf = (text) => String(text || '').toLowerCase().replace(/[\d.,:]+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 120);

export const itemKey = (module, kind, subject) => {
  const short = String(kind || '').startsWith(`${module}.`) ? kind.slice(module.length + 1) : String(kind || 'alert');
  return `${module}:${short}:${String(subject || '-').slice(0, 140)}`;
};

const clean = (s, n) => String(s ?? '').slice(0, n);

export class Inbox extends EventEmitter {
  /**
   * @param {object} o
   * @param {string|null} o.file     persisted state (DATA_DIR/inbox.json); null keeps it in memory
   * @param {() => number} o.now
   * @param {(item, type, why) => {toast:boolean, discord:boolean, why:string|null}} o.decide
   */
  constructor({ file = null, now = () => Date.now(), decide = () => ({ toast: false, discord: false, why: null }) } = {}) {
    super();
    this.setMaxListeners(100);
    this.file = file;
    this.now = now;
    this.decide = decide;
    this.items = new Map();
    this.updates = [];
    // A console that has never run has no memory of what was already wrong:
    // its first look raises silently rather than toasting the whole backlog.
    this.fresh = true;
    if (file && existsSync(file)) {
      try {
        const j = JSON.parse(readFileSync(file, 'utf8'));
        for (const it of j.items || []) if (it?.key) this.items.set(it.key, it);
        this.updates = Array.isArray(j.updates) ? j.updates.slice(0, MAX_UPDATES) : [];
        this.fresh = false;
      } catch { /* start over */ }
    }
    this.saveTimer = null;
    this.baselined = new Set();   // modules whose first observation has been taken
  }

  /* ── persistence ─────────────────────────────────────────────────── */
  #changed(item, { notify = null } = {}) {
    this.emit('change', item);
    if (notify) this.emit('notify', notify);
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 500);
    this.saveTimer.unref?.();
  }

  save() {
    if (!this.file) return;
    this.prune();
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ items: [...this.items.values()], updates: this.updates }), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  prune() {
    const now = this.now();
    for (const [k, it] of this.items) {
      if (it.state === 'resolved' && now - (it.resolvedAt || 0) > RESOLVED_KEEP_MS) this.items.delete(k);
      if (it.state === 'holding' && now - (it.lastAt || 0) > RESOLVED_KEEP_MS) this.items.delete(k);
    }
    if (this.items.size > MAX_ITEMS) {
      const old = [...this.items.values()].sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0));
      for (const it of old.slice(0, this.items.size - MAX_ITEMS)) this.items.delete(it.key);
    }
    this.updates = this.updates.filter((u) => now - u.at < UPDATES_KEEP_MS).slice(0, MAX_UPDATES);
  }

  /* ── building items ──────────────────────────────────────────────── */
  #base(key, d, type) {
    const now = this.now();
    return {
      key,
      module: d.module,
      moduleName: clean(d.moduleName || d.module, 40),
      kind: type?.id || d.kind,
      kindLabel: clean(type?.label || d.kind, 80),
      title: clean(d.title, 200),
      body: clean(d.body, 600),
      severity: d.severity || type?.severity || 'warn',
      blocking: !!(d.blocking ?? type?.blocking),
      route: d.route || null,
      action: clean(d.action || (d.blocking ?? type?.blocking ? 'Answer' : 'Open'), 24),
      source: d.source || 'alerts',
      state: 'holding',
      seen: 0,
      firstAt: now,
      lastAt: now,
      raisedAt: null,
      resolvedAt: null,
      absentSince: null,
      count: 0,
      countSince: null,
      snoozedUntil: null,
      dismissed: false,
      notifiedAt: null,
    };
  }

  #refresh(it, d, type) {
    it.title = clean(d.title ?? it.title, 200);
    it.body = clean(d.body ?? it.body, 600);
    if (d.severity) it.severity = d.severity;
    if (d.route) it.route = d.route;
    if (d.action) it.action = clean(d.action, 24);
    if (type?.label) it.kindLabel = clean(type.label, 80);
    if (d.moduleName) it.moduleName = clean(d.moduleName, 40);
    it.lastAt = this.now();
  }

  #raise(it, type, { silent = false } = {}) {
    const now = this.now();
    const regroup = !!it.resolvedAt && now - it.resolvedAt < REGROUP_MS && it.count > 0;
    it.count = regroup ? it.count + 1 : 1;
    if (!regroup) it.countSince = now;
    it.state = 'open';
    it.raisedAt = now;
    it.resolvedAt = null;
    it.absentSince = null;
    it.dismissed = false;
    let notify = null;
    if (!silent) {
      const d = this.decide(it, type) || {};
      it.delivery = { toast: !!d.toast, discord: !!d.discord, why: d.why || null, channel: d.channel || null };
      if (d.toast || d.discord) {
        it.notifiedAt = now;
        notify = { item: this.publicItem(it), toast: !!d.toast, discord: !!d.discord, type };
      }
    } else {
      it.delivery = { toast: false, discord: false, why: 'baseline', channel: null };
    }
    this.#changed(it, { notify });
    return it;
  }

  #resolve(it) {
    if (it.state === 'resolved') return;
    if (it.state === 'holding') { this.items.delete(it.key); this.#changed(it); return; }
    it.state = 'resolved';
    it.resolvedAt = this.now();
    it.absentSince = null;
    it.snoozedUntil = null;
    this.#changed(it);
  }

  /**
   * One poll's worth of a module's stated alerts. `alerts` are
   * { key, kind, title, body, severity, route, action } and `types` maps kind -> catalogue type.
   * Everything this module stated last time and not now counts as absent.
   */
  observeModule(module, alerts, types = new Map(), { moduleName } = {}) {
    const now = this.now();
    const first = !this.baselined.has(module);
    this.baselined.add(module);
    const silent = first && this.fresh;
    const present = new Set();
    for (const a of alerts) {
      const type = types.get(a.kind) || null;
      const key = a.key || itemKey(module, a.kind, subjectOf(a.title));
      present.add(key);
      let it = this.items.get(key);
      const d = { ...a, module, moduleName, source: 'alerts' };
      if (!it) { it = this.#base(key, d, type); this.items.set(key, it); }
      this.#refresh(it, d, type);
      it.absentSince = null;
      const hold = Math.max(1, Number(type?.hold) || 2);
      if (it.state === 'open') { this.#changed(it); continue; }
      if (it.state === 'resolved') { it.state = 'holding'; it.seen = 0; }
      it.seen += 1;
      // Already wrong when the console first looked: no news, raise quietly.
      if (silent || it.seen >= hold) this.#raise(it, type, { silent });
    }
    for (const it of this.items.values()) {
      if (it.module !== module || it.source !== 'alerts' || present.has(it.key)) continue;
      if (it.state === 'holding') {
        // A flicker. An item with a past keeps it (for ×N); a new one is forgotten.
        if (it.count > 0 && it.resolvedAt) { it.state = 'resolved'; it.seen = 0; } else this.items.delete(it.key);
        this.#changed(it);
        continue;
      }
      if (it.state !== 'open') continue;
      const type = types.get(it.kind) || null;
      const clearMs = Math.max(0, Number(type?.clearMin ?? 5)) * 60_000;
      if (!it.absentSince) it.absentSince = now;
      if (now - it.absentSince >= clearMs) this.#resolve(it);
    }
  }

  /** An explicit raise from a module event. Raising an open item updates it without a second notification. */
  raise(module, d, type) {
    const key = d.key || itemKey(module, type?.id || d.kind, d.subject || subjectOf(d.title));
    let it = this.items.get(key);
    if (!it) { it = this.#base(key, { ...d, module, source: 'events' }, type); this.items.set(key, it); }
    this.#refresh(it, d, type);
    if (it.state === 'open') { this.#changed(it); return { item: it, raised: false }; }
    this.#raise(it, type);
    return { item: it, raised: true };
  }

  resolve(key) {
    const it = this.items.get(key);
    if (!it) return false;
    this.#resolve(it);
    return true;
  }

  /** A non-blocking happening: one line in the digest, never a toast. */
  addUpdate(module, d, type) {
    const u = { at: this.now(), module, moduleName: clean(d.moduleName || module, 40), kind: type?.id || d.kind, title: clean(d.title, 200), body: clean(d.body, 300), severity: d.severity || 'info', route: d.route || null };
    this.updates.unshift(u);
    if (this.updates.length > MAX_UPDATES) this.updates.length = MAX_UPDATES;
    this.#changed(null);
    return u;
  }

  /* ── what the person does ────────────────────────────────────────── */
  snooze(key, minutes = 60) {
    const it = this.items.get(key);
    if (!it || it.state !== 'open') return null;
    it.snoozedUntil = this.now() + Math.max(1, Math.min(7 * 1440, Number(minutes) || 60)) * 60_000;
    this.#changed(it);
    return it;
  }

  unsnooze(key) {
    const it = this.items.get(key);
    if (!it) return null;
    it.snoozedUntil = null;
    this.#changed(it);
    return it;
  }

  /** "Done" for an item nothing will resolve on its own; it comes back if raised again. */
  dismiss(key) {
    const it = this.items.get(key);
    if (!it) return null;
    it.dismissed = true;
    this.#resolve(it);
    return it;
  }

  undismiss(key) {
    const it = this.items.get(key);
    if (!it || !it.dismissed) return null;
    it.dismissed = false;
    it.state = 'open';
    it.resolvedAt = null;
    this.#changed(it);
    return it;
  }

  /** Forget resolved items: one by key, or all of them. Returns how many went. */
  clearResolved(key = null) {
    let n = 0;
    for (const [k, it] of this.items) {
      if (it.state !== 'resolved' || (key && k !== key)) continue;
      this.items.delete(k);
      n += 1;
    }
    if (n) this.#changed(null);
    return n;
  }

  /* ── views ───────────────────────────────────────────────────────── */
  publicItem(it) {
    const now = this.now();
    return {
      key: it.key, module: it.module, moduleName: it.moduleName, kind: it.kind, kindLabel: it.kindLabel,
      title: it.title, body: it.body, severity: it.severity, blocking: it.blocking, route: it.route, action: it.action,
      state: it.state, raisedAt: it.raisedAt, lastAt: it.lastAt, resolvedAt: it.resolvedAt, firstAt: it.firstAt,
      count: it.count, countSince: it.countSince,
      snoozedUntil: it.snoozedUntil && it.snoozedUntil > now ? it.snoozedUntil : null,
      dismissed: !!it.dismissed,
      source: it.source,
    };
  }

  /**
   * @param {(kind:string) => string} channelOf   'toast' | 'inbox' | 'off' for a kind, now
   */
  snapshot(channelOf = () => 'inbox') {
    const now = this.now();
    const open = [];
    const snoozed = [];
    const resolved = [];
    const muted = new Map();
    const today = now - 24 * 3_600_000;
    for (const it of this.items.values()) {
      const ch = channelOf(it.kind, it);
      if (ch === 'off') {
        if ((it.raisedAt || 0) > today || it.state === 'open') {
          const m = muted.get(it.kind) || { kind: it.kind, label: it.kindLabel, module: it.module, moduleName: it.moduleName, count: 0 };
          m.count += Math.max(1, it.count || 1);
          muted.set(it.kind, m);
        }
        continue;
      }
      if (it.state === 'open') {
        if (it.snoozedUntil && it.snoozedUntil > now) snoozed.push(this.publicItem(it));
        else open.push(this.publicItem(it));
      } else if (it.state === 'resolved' && now - (it.resolvedAt || 0) < 6 * 3_600_000) {
        resolved.push(this.publicItem(it));
      }
    }
    const rank = (x) => (x.blocking ? 0 : x.severity === 'critical' || x.severity === 'err' ? 1 : x.severity === 'warn' ? 2 : 3);
    open.sort((a, b) => rank(a) - rank(b) || (b.raisedAt || 0) - (a.raisedAt || 0));
    snoozed.sort((a, b) => a.snoozedUntil - b.snoozedUntil);
    resolved.sort((a, b) => b.resolvedAt - a.resolvedAt);
    return {
      at: now,
      open,
      snoozed,
      resolved: resolved.slice(0, 12),
      muted: [...muted.values()],
      updates: this.updates.filter((u) => now - u.at < UPDATES_KEEP_MS).slice(0, 30),
    };
  }
}
