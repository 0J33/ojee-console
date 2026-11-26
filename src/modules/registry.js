/**
 * The module registry.
 *
 * A module is an independent service — its own repo, its own container, its
 * own README — that also happens to describe itself well enough for the
 * console to mount it. It does that by serving one file:
 *
 *     GET /module.json
 *     {
 *       "id": "home",
 *       "name": "Home",
 *       "version": "1.0.0",
 *       "views": [ { "id": "overview", "label": "Overview", "icon": "i-grid" }, ... ],
 *       "ui": "/ui/index.js",          // ES module, default-exports { mount, unmount }
 *       "health": "/api/health",
 *       "capabilities": ["sse", "commands"]
 *     }
 *
 * The console proxies `/{id}/*` to the module, injects the authenticated
 * identity, and builds one unified nav out of every manifest. The module never
 * implements login and never renders chrome.
 *
 * Two design choices worth stating:
 *
 *   - Discovery is LAZY AND REPEATED, not once at boot. Containers start in
 *     whatever order Docker feels like; a registry that snapshots at boot shows
 *     a permanently missing module because it happened to lose a race. Manifests
 *     are re-fetched on a timer and on demand.
 *
 *   - A module that fails its health check is DEGRADED, not hidden. It keeps
 *     its nav entry, marked unavailable, carrying the reason. Silently removing
 *     it makes a broken deployment look like a feature that was never there —
 *     the single most confusing failure mode a modular app has.
 */

import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_TIMEOUT_MS = 4000;

/** Module ids appear in URLs and CSS hooks — keep them boring. */
const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;

export class ModuleRegistry {
  /**
   * @param {object} opts
   * @param {Array}  opts.configured  [{ id, origin, enabled, name?, requires? }]
   * @param {number} opts.refreshMs   how often to re-poll manifests + health
   * @param {Function} opts.fetchImpl injectable for tests
   */
  constructor({ configured = [], refreshMs = 20_000, fetchImpl = fetch } = {}) {
    this.refreshMs = refreshMs;
    this.fetch = fetchImpl;
    this.timer = null;
    // Who wants to hear when a module's status flips. The server streams
    // these to every open console so the nav changes without a reload.
    this.statusHooks = new Set();

    this.modules = new Map();
    for (const c of configured) {
      if (!ID_RE.test(c.id || '')) {
        throw new Error(`module id ${JSON.stringify(c.id)} is invalid — lowercase letters, digits and dashes, starting with a letter`);
      }
      this.modules.set(c.id, {
        id: c.id,
        // Name from config until the manifest supplies a better one, so a
        // module that has never answered still has something to render.
        name: c.name || c.id,
        origin: String(c.origin || '').replace(/\/+$/, ''),
        // Never appears in publicList() — the browser must not learn a
        // module's upstream credential just because it can read the nav.
        token: c.token || '',
        enabled: c.enabled !== false,
        label: c.label || null,
        nav: c.nav !== false,
        quietOffline: c.quietOffline === true,
        manifest: null,
        status: c.enabled === false ? 'disabled' : 'unknown',
        reason: c.enabled === false ? 'Disabled in config' : 'Not yet contacted',
        lastCheck: 0,
        latencyMs: null,
      });
    }
  }

  list() {
    return [...this.modules.values()];
  }

  get(id) {
    return this.modules.get(id);
  }

  /** What the frontend needs to render nav and load module UIs. */
  publicList() {
    return this.list().map((m) => ({
      id: m.id,
      name: m.label || m.manifest?.name || m.name,
      nav: m.nav !== false && m.manifest?.nav !== false,
      quietOffline: !!m.quietOffline,
      // Overview row icon/order hints and the alert kinds are read by the shell.
      summary: (m.manifest?.capabilities || []).includes('summary'),
      version: m.manifest?.version || null,
      status: m.status,
      reason: m.status === 'ready' ? null : m.reason,
      enabled: m.enabled,
      // The manifest's own icon, when it names a sprite symbol. This was
      // documented and never passed on, so every module the shell had no
      // hard-coded entry for fell back to the same box.
      icon: /^i-[a-z0-9-]+$/.test(m.manifest?.icon || '') ? m.manifest.icon : null,
      views: m.manifest?.views || [],
      ui: m.manifest?.ui || null,
      header: m.manifest?.header === false ? false : undefined,
      viewTabs: m.manifest?.viewTabs === false ? false : undefined,
      // A second entry point, for a screen the console can open on its own —
      // the overview's assistant icon imports this without mounting the module
      // first, the same way `ui` is handled: a root-relative path, nothing
      // that could walk out of the module's own root.
      assistant: (() => {
        const a = m.manifest?.assistant;
        return typeof a === 'string' && /^\/[A-Za-z0-9_\-/.]+$/.test(a) && !a.includes('..') ? a : null;
      })(),
      // A module may open its object up in place on the overview and mount
      // a small UI over it. Paths only, relative to the module.
      focus: (() => {
        const f = m.manifest?.focus;
        const ok = (x) => typeof x === 'string' && /^\/[A-Za-z0-9_\-/.]+$/.test(x) && !x.includes('..');
        return f && ok(f.ui) ? { ui: f.ui, css: ok(f.css) ? f.css : null } : null;
      })(),
      capabilities: m.manifest?.capabilities || [],
      // Quick actions the tile may fire: id, label, icon — nothing else
      // crosses the line, and the shapes are checked before they do.
      quickActions: Array.isArray(m.manifest?.quickActions)
        ? m.manifest.quickActions
          .filter((a) => a && typeof a.id === 'string' && /^[a-z0-9-]{1,32}$/.test(a.id))
          .map((a) => ({
            id: a.id,
            label: typeof a.label === 'string' && a.label ? a.label.slice(0, 48) : a.id,
            icon: typeof a.icon === 'string' && /^i-[a-z0-9-]{1,32}$/.test(a.icon) ? a.icon : null,
          }))
        : [],
      latencyMs: m.latencyMs,
    }));
  }

  /** Watch status and reason; fires only when either actually changes. */
  onStatusChange(fn) {
    this.statusHooks.add(fn);
    return () => this.statusHooks.delete(fn);
  }

  #emit() {
    for (const fn of this.statusHooks) {
      try { fn(); } catch { /* one bad listener must not stop the probe */ }
    }
  }

  /**
   * A proxied request just failed to reach the module. Say so at once rather
   * than waiting for the next sweep — and only when it is news.
   */
  noteUnreachable(id, reason) {
    const m = this.modules.get(id);
    if (!m) return;
    if (m.status === 'unreachable' && m.reason === reason) return;
    m.status = 'unreachable';
    m.reason = reason;
    this.#emit();
  }

  async #getJson(url, timeoutMs, token = '') {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const started = Date.now();
      const res = await this.fetch(url, {
        signal: ac.signal,
        headers: {
          accept: 'application/json',
          // Without this a tokened module reports itself unreachable: the
          // health probe gets a 401 and the nav shows it as down.
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) return { error: `HTTP ${res.status}`, latencyMs };
      return { json: await res.json(), latencyMs };
    } catch (e) {
      return { error: e.name === 'AbortError' ? `no response in ${timeoutMs}ms` : shortError(e) };
    } finally {
      clearTimeout(t);
    }
  }

  /** Re-fetch one module's manifest and health. Never throws. */
  async refreshOne(id, opts) {
    const m = this.modules.get(id);
    if (!m) return null;
    const was = `${m.status}\u0000${m.reason}`;
    const out = await this.#refreshOneInner(id, opts);
    if (out && `${out.status}\u0000${out.reason}` !== was) this.#emit();
    return out;
  }

  async #refreshOneInner(id, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const m = this.modules.get(id);
    if (!m) return null;
    if (!m.enabled) {
      m.status = 'disabled';
      m.reason = 'Disabled in config';
      return m;
    }
    if (!m.origin) {
      m.status = 'misconfigured';
      m.reason = 'No origin set — check config/console.json';
      return m;
    }

    m.lastCheck = Date.now();

    const manifest = await this.#getJson(`${m.origin}/module.json`, timeoutMs, m.token);
    if (manifest.error) {
      m.status = 'unreachable';
      m.reason = `${m.origin} — ${manifest.error}`;
      m.latencyMs = null;
      return m;
    }

    const bad = validateManifest(manifest.json, id);
    if (bad) {
      m.status = 'invalid';
      m.reason = bad;
      return m;
    }

    m.manifest = manifest.json;
    m.name = manifest.json.name || m.name;
    m.latencyMs = manifest.latencyMs;

    // A manifest proves the module is serving; the health endpoint proves it
    // can do its job. A module can absolutely serve its own manifest while its
    // device is unplugged, and the nav should say so.
    const healthPath = manifest.json.health || '/api/health';
    const health = await this.#getJson(`${m.origin}${healthPath}`, timeoutMs, m.token);
    if (health.error) {
      m.status = 'degraded';
      m.reason = `Health check failed — ${health.error}`;
      return m;
    }
    if (health.json && health.json.ok === false) {
      m.status = 'degraded';
      m.reason = health.json.reason || health.json.detail || 'Module reports it is not ready';
      return m;
    }

    m.status = 'ready';
    m.reason = null;
    return m;
  }

  async refreshAll(opts) {
    await Promise.all(this.list().map((m) => this.refreshOne(m.id, opts)));
    return this.publicList();
  }

  /**
   * Poll in the background. The first sweep runs immediately so the console
   * does not serve an "unknown" nav for a full interval after boot.
   */
  start() {
    if (this.timer) return;
    const tick = async () => {
      await this.refreshAll().catch(() => {});
      this.timer = setTimeout(tick, this.refreshMs);
      this.timer.unref?.();
    };
    tick();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function validateManifest(m, expectedId) {
  if (!m || typeof m !== 'object') return 'module.json is not an object';
  if (m.id !== expectedId) {
    // A mismatch means the console is proxying `/home/*` to something that
    // thinks it is `/remote` — every URL the module builds would be wrong.
    return `module.json declares id "${m.id}" but is configured as "${expectedId}"`;
  }
  if (!Array.isArray(m.views) || m.views.length === 0) return 'module.json declares no views';
  for (const v of m.views) {
    if (!v?.id || !v?.label) return `a view is missing id or label: ${JSON.stringify(v)}`;
  }
  if (m.ui && !String(m.ui).startsWith('/')) return `ui path must be root-relative, got "${m.ui}"`;
  if (m.assistant && !String(m.assistant).startsWith('/')) {
    return `assistant path must be root-relative, got "${m.assistant}"`;
  }
  return null;
}

function shortError(e) {
  const msg = e?.cause?.code || e?.code || e?.message || String(e);
  return String(msg).slice(0, 120);
}

export { validateManifest, ID_RE, delay };
