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
        enabled: c.enabled !== false,
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
      name: m.manifest?.name || m.name,
      version: m.manifest?.version || null,
      status: m.status,
      reason: m.status === 'ready' ? null : m.reason,
      enabled: m.enabled,
      views: m.manifest?.views || [],
      ui: m.manifest?.ui || null,
      capabilities: m.manifest?.capabilities || [],
      latencyMs: m.latencyMs,
    }));
  }

  async #getJson(url, timeoutMs) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const started = Date.now();
      const res = await this.fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
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
  async refreshOne(id, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
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

    const manifest = await this.#getJson(`${m.origin}/module.json`, timeoutMs);
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
    const health = await this.#getJson(`${m.origin}${healthPath}`, timeoutMs);
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
  return null;
}

function shortError(e) {
  const msg = e?.cause?.code || e?.code || e?.message || String(e);
  return String(msg).slice(0, 120);
}

export { validateManifest, ID_RE, delay };
