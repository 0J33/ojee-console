/**
 * Phone widgets (Scriptable on iOS).
 *
 * A widget cannot sign in: it has no cookie jar it keeps, no way to type a
 * TOTP code, and it runs whenever iOS feels like it. So it gets a key of its
 * own, made on the Settings page, that can do exactly two things:
 *
 *   GET  /api/widget      one compact read of every module's state
 *   POST /api/widget/ac   turn the AC on or off
 *
 * Nothing else accepts it. The tailnet gate still runs first, so a key on its
 * own is useless off the tailnet.
 *
 * Keys are stored as SHA-256 hashes. The key itself is shown once, when it is
 * made, and never again.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { signIdentity } from './modules/proxy.js';

const sha = (s) => createHash('sha256').update(String(s)).digest();

export class WidgetKeys {
  constructor({ file, now = () => Date.now() }) {
    this.file = file;
    this.now = now;
    this.keys = [];
    try { this.keys = JSON.parse(readFileSync(file, 'utf8')).keys || []; } catch { /* none yet */ }
    this.dirty = null;
  }

  #save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ keys: this.keys }, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  list() {
    return this.keys.map(({ id, label, createdAt, lastUsedAt, uses }) => ({ id, label, createdAt, lastUsedAt, uses }));
  }

  create(label) {
    const key = `ojw_${randomBytes(24).toString('base64url')}`;
    const rec = {
      id: randomBytes(6).toString('hex'),
      label: String(label || 'Widgets').trim().slice(0, 60) || 'Widgets',
      hash: sha(key).toString('hex'),
      createdAt: this.now(),
      lastUsedAt: null,
      uses: 0,
    };
    this.keys.push(rec);
    this.#save();
    return { key, ...this.list().find((k) => k.id === rec.id) };
  }

  remove(id) {
    const n = this.keys.length;
    this.keys = this.keys.filter((k) => k.id !== id);
    if (this.keys.length === n) return false;
    this.#save();
    return true;
  }

  /** The key's record, or null. Use is noted, written at most once a minute. */
  verify(key) {
    if (typeof key !== 'string' || !key.startsWith('ojw_') || key.length > 100) return null;
    const h = sha(key);
    const rec = this.keys.find((k) => timingSafeEqual(Buffer.from(k.hash, 'hex'), h));
    if (!rec) return null;
    const t = this.now();
    const write = !rec.lastUsedAt || t - rec.lastUsedAt > 60_000;
    rec.lastUsedAt = t;
    rec.uses += 1;
    if (write) { try { this.#save(); } catch { /* best effort */ } }
    return rec;
  }
}

/** Express middleware: `Authorization: Bearer ojw_…`. */
export function widgetAuth(keys) {
  return (req, res, next) => {
    const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
    const rec = m && keys.verify(m[1]);
    if (!rec) {
      // A short pause makes guessing slow without bothering a real widget.
      return setTimeout(() => res.status(401).json({ error: 'bad_widget_key' }), 400);
    }
    req.widgetKey = rec;
    next();
  };
}

/**
 * Reads modules server to server, signed like the proxy, and boils their
 * state down to what a widget draws.
 */
export class WidgetData {
  constructor({ registry, identitySecret, fetchImpl = fetch, cacheMs = 20_000, now = () => Date.now() }) {
    this.registry = registry;
    this.secret = identitySecret;
    this.fetch = fetchImpl;
    this.cacheMs = cacheMs;
    this.now = now;
    this.cache = null;
    this.inflight = null;
  }

  #headers(m) {
    const ts = String(this.now());
    const user = 'console';
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-console-user': user,
      'x-console-display': 'widget',
      'x-console-module': m.id,
      'x-console-ts': ts,
      'x-console-auth': signIdentity({ user, moduleId: m.id, ts, secret: this.secret }),
      ...(m.token ? { authorization: `Bearer ${m.token}` } : {}),
    };
  }

  async #call(id, path, { method = 'GET', body, timeout = 6000 } = {}) {
    const m = this.registry.get(id);
    if (!m || !m.enabled || !m.origin) return null;
    try {
      const r = await this.fetch(`${m.origin}${path}`, {
        method,
        headers: this.#headers(m),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      const json = await r.json().catch(() => null);
      return r.ok ? json : { error: json?.detail || json?.error || `HTTP ${r.status}`, status: r.status };
    } catch (e) {
      return { error: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.message) };
    }
  }

  async get({ fresh = false } = {}) {
    if (!fresh && this.cache && this.now() - this.cache.at < this.cacheMs) return this.cache.data;
    if (this.inflight) return this.inflight;
    this.inflight = this.#build().then((data) => {
      this.cache = { at: this.now(), data };
      return data;
    }).finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async #build() {
    const mods = this.registry.list().filter((m) => m.enabled);
    const summaries = Object.fromEntries(await Promise.all(mods.map(async (m) => {
      if (m.status !== 'ready') return [m.id, null];
      const caps = m.manifest?.capabilities || [];
      if (!caps.includes('summary')) return [m.id, null];
      const s = await this.#call(m.id, '/api/summary');
      return [m.id, s && !s.error ? s : null];
    })));

    const overview = mods.map((m) => {
      const s = summaries[m.id];
      const status = m.status !== 'ready' ? 'err' : (s?.status || 'ok');
      return {
        id: m.id,
        name: m.manifest?.name || m.name,
        status,
        headline: m.status !== 'ready' ? (m.reason || 'not answering') : (s?.headline || ''),
        alerts: (s?.alerts || []).slice(0, 3).map((a) => ({ text: a.text, severity: a.severity || 'warn' })),
      };
    });
    const alerts = overview.flatMap((o) => o.alerts.map((a) => ({ ...a, module: o.id, name: o.name })))
      .concat(overview.filter((o) => o.status === 'err' && !o.alerts.length).map((o) => ({ text: `${o.name}: ${o.headline}`, severity: 'err', module: o.id, name: o.name })));

    const [health, home, music, router, fleet, agent, peripherals, remote] = await Promise.all([
      this.#health(summaries.health),
      this.#home(summaries.home),
      Promise.resolve(this.#music(summaries.music)),
      Promise.resolve(this.#router(summaries.router)),
      Promise.resolve(this.#fleet(summaries.fleet)),
      Promise.resolve(this.#agent(summaries.agent)),
      Promise.resolve(this.#peripherals(summaries.peripherals)),
      Promise.resolve(summaries.remote ? { headline: summaries.remote.headline, online: summaries.remote.model?.online ?? null, devices: summaries.remote.model?.devices ?? null } : null),
    ]);

    return {
      at: this.now(),
      status: overview.some((o) => o.status === 'err') ? 'err' : overview.some((o) => o.status === 'warn') ? 'warn' : 'ok',
      overview,
      alerts,
      health, home, music, router, fleet, agent, peripherals, remote,
    };
  }

  async #health(s) {
    if (!s) return null;
    const [data, wk] = await Promise.all([this.#call('health', '/api/data', { timeout: 8000 }), this.#call('health', '/api/workouts')]);
    const d = data && !data.error ? data : null;
    const series = d?.series || [];
    const lastWith = (k) => [...series].reverse().find((r) => r[k] != null)?.[k] ?? null;
    const night = d?.sleep?.nights?.find((n) => n.main) || d?.sleep?.nights?.[0] || null;
    const ex = (d?.activity?.exercises || []).slice().sort((a, b) => b.startMs - a.startMs)[0] || null;
    const running = wk && !wk.error ? wk.running : null;
    return {
      steps: d?.activity?.today?.steps ?? null,
      stepTarget: d?.activity?.stepTarget ?? null,
      azm: d?.activity?.today?.azm ?? null,
      azmTarget: d?.activity?.azmTarget ?? null,
      kcal: d?.activity?.today?.kcal != null ? Math.round(d.activity.today.kcal) : null,
      bpm: d?.state?.hr?.bpm ?? s.model?.bpm ?? null,
      bpmAt: d?.state?.hr?.t ?? null,
      rest: lastWith('rhr'),
      hrv: lastWith('hrv'),
      battery: d?.state?.device?.battery ?? s.model?.battery ?? null,
      lastSync: d?.state?.device?.lastSync ?? null,
      sleep: night ? { date: night.date, min: night.asleepMin, start: night.startMs, end: night.endMs } : null,
      week: series.slice(-7).map((r) => ({ date: r.date, steps: r.steps })),
      readiness: d?.readiness?.label || null,
      workout: running ? { running: true, start: running.start_ms ?? running.start ?? running.startMs ?? null, avgHr: running.avgHr ?? null } : null,
      lastWorkout: ex ? { start: ex.startMs, end: ex.endMs, name: ex.name || ex.type || 'Workout', avgHr: ex.avgHr ?? null } : null,
      headline: s.headline,
    };
  }

  async #home(s) {
    if (!s) return null;
    const ac = await this.#acDevice();
    const st = ac?.state || {};
    return {
      device: ac ? { id: ac.id, name: ac.name, room: ac.room || null, available: ac.available !== false } : null,
      power: !!(st.power ?? s.model?.power),
      mode: st.mode ?? s.model?.mode ?? null,
      fan: st.fan ?? null,
      indoor: st.indoor_temperature ?? s.model?.indoor ?? null,
      target: st.target_temperature ?? s.model?.target ?? null,
      outdoor: st.outdoor_temperature ?? null,
      home: s.model?.home ?? null,
      headline: s.headline,
    };
  }

  /** The device that reports a room temperature: the AC. */
  async #acDevice() {
    const list = await this.#call('home', '/api/devices');
    if (!Array.isArray(list)) return null;
    return list.find((d) => d.state?.indoor_temperature != null && 'power' in (d.state || {}))
      || list.find((d) => 'power' in (d.state || {}) && /ac|air/i.test(`${d.kind || ''} ${d.type || ''} ${d.name || ''}`))
      || null;
  }

  /** power: true | false | 'toggle'. */
  async setAc(power) {
    const ac = await this.#acDevice();
    if (!ac) return { ok: false, error: 'No AC found in Home.' };
    const want = power === 'toggle' ? !ac.state?.power : !!power;
    const r = await this.#call('home', `/api/devices/${encodeURIComponent(ac.id)}/command`, { method: 'POST', body: { power: want }, timeout: 15_000 });
    this.cache = null;
    if (!r || r.error) return { ok: false, error: r?.error || 'Home did not answer.' };
    return { ok: true, power: want, name: ac.name };
  }

  #music(s) {
    if (!s) return null;
    const m = s.model || {};
    return {
      connected: !!m.connected,
      playing: !!m.playing,
      title: m.title || null,
      artist: m.artist || null,
      album: m.album || null,
      device: m.device || null,
      progress: m.progress ?? null,
      durationMs: m.durationMs ?? null,
      // Spotify's own CDN address for the cover; the widget fetches it directly.
      cover: (() => {
        try { return m.cover ? new URL(m.cover, 'http://x').searchParams.get('u') : null; } catch { return null; }
      })(),
      headline: s.headline,
    };
  }

  #router(s) {
    if (!s) return null;
    const light = (id) => (s.lights || s.model?.lights || []).find((l) => l.id === id);
    const data = light('data')?.detail || '';
    const pct = /(\d+(?:\.\d+)?)%/.exec(data);
    const cap = /of\s*(\d+(?:\.\d+)?)\s*GB/i.exec(data);
    const used = /(\d+(?:\.\d+)?)\s*GB used/i.exec(data);
    const fact = (k) => s.facts?.find((f) => f.k === k)?.v || null;
    const dbm = /(-?\d+)\s*dBm/.exec(fact('Signal') || light('signal')?.detail || '');
    const net = /(5G|4G|LTE)[^·]*/.exec(light('internet')?.detail || s.headline || '');
    return {
      connected: s.model?.connected ?? null,
      network: net ? net[0].trim() : null,
      quality: /excellent|good|fair|poor|weak/i.exec(s.headline || light('signal')?.detail || '')?.[0]?.toLowerCase() || null,
      bars: s.model?.bars ?? null,
      dbm: dbm ? Number(dbm[1]) : null,
      usedPct: pct ? Number(pct[1]) : null,
      capGb: cap ? Number(cap[1]) : null,
      usedGb: used ? Number(used[1]) : null,
      now: fact('Now'),
      clients: s.model?.clients ?? null,
      status: s.status,
      headline: s.headline,
    };
  }

  #fleet(s) {
    if (!s) return null;
    const disk = s.facts?.find((f) => f.k === 'Disk')?.v || null;
    const services = s.facts?.find((f) => f.k === 'Services')?.v || null;
    return {
      hosts: (s.model?.hosts || []).map((h) => ({ name: h.name, up: !!h.up, load: h.load ?? null, failing: h.failing || 0 })),
      disk,
      services,
      status: s.status,
      headline: s.headline,
    };
  }

  #agent(s) {
    if (!s) return null;
    const fact = (k) => s.facts?.find((f) => f.k === k)?.v || null;
    return {
      running: s.model?.running ?? null,
      queued: s.model?.queued ?? null,
      failed: s.model?.failed ?? null,
      workflows: fact('Workflows'),
      lastRun: fact('Last run'),
      assistant: fact('Assistant'),
      headline: s.headline,
    };
  }

  #peripherals(s) {
    if (!s) return null;
    return {
      devices: (s.model?.devices || []).map((d) => ({
        kind: d.kind, online: !!d.online, battery: d.battery ?? null, charging: !!d.charging, link: d.link || null,
      })),
      headline: s.headline,
    };
  }
}
