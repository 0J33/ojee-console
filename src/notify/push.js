/**
 * Web Push — the "App" channel for a console that is not open.
 *
 * The SSE stream (/api/notify/stream) only reaches a console that is running.
 * A browser that subscribed here — the console added to an iPhone's Home
 * Screen (iOS 16.4+), Chrome/Edge/Firefox on a desktop, Chrome on Android —
 * is reached through its push service even when the page is closed, and its
 * service worker (public/sw.js) shows the notification.
 *
 * The router decides once (center.js → policy.decide); this file only
 * delivers that one decision to every subscribed device.
 *
 *   DATA_DIR/vapid.json               { publicKey, privateKey, createdAt } (0600)
 *   DATA_DIR/push-subscriptions.json  [{ id, label, endpoint, keys, ua, addedAt,
 *                                        lastOkAt, lastError, lastErrorAt, fails }] (0600)
 *
 * The private key never leaves this file's process: the page gets the public
 * key only. A subscription's endpoint is a capability for the push service
 * (useless without our private key), but it is still not shown on the page —
 * a device is named by a short hash of it, which the page can compute itself
 * from its own subscription to recognise "this device".
 */

import { readFileSync, writeFileSync, renameSync, chmodSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import webpush from 'web-push';

/** The push services browsers actually use. A subscription naming anything else is refused (no SSRF from the settings page). */
export const PUSH_HOSTS = /^(?:fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;

export const TTL_SEC = 12 * 3600;
const MAX_DEVICES = 20;
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** The id the page can compute too: sha256(endpoint), base64url, 16 chars. */
export const deviceId = (endpoint) => createHash('sha256').update(String(endpoint)).digest('base64url').slice(0, 16);

/** A tag becomes a push `topic` (≤32 base64url chars): a newer message with the same topic replaces one still queued. */
export const topicOf = (tag) => createHash('sha256').update(String(tag || 'ojee')).digest('base64url').slice(0, 32);

/** What the service worker gets. Small: well under the 4 KB a push service accepts. */
export function payloadOf(ev) {
  const p = {
    title: String(ev.title || 'ojee console').slice(0, 120),
    body: String(ev.body || '').slice(0, 600),
    tag: String(ev.tag || ev.id || 'ojee').slice(0, 120),
    route: typeof ev.route === 'string' && /^#\/[A-Za-z0-9_\-/]*$/.test(ev.route) ? ev.route : '#/',
    severity: ['info', 'warn', 'critical'].includes(ev.severity) ? ev.severity : 'info',
    icon: '/icon-192.png',
    key: String(ev.key || '').slice(0, 40),
    at: Number(ev.at) || Date.now(),
  };
  return JSON.stringify(p);
}

function readJson(file, fallback) {
  if (!file || !existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, data) {
  if (!file) return;
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* best effort */ }
}

/** Load the VAPID pair, or make one on first start and keep it. */
export function loadVapid(file, { generate = () => webpush.generateVAPIDKeys(), now = Date.now } = {}) {
  const cur = readJson(file, null);
  if (cur && typeof cur.publicKey === 'string' && typeof cur.privateKey === 'string' && B64URL.test(cur.publicKey) && B64URL.test(cur.privateKey)) {
    try { chmodSync(file, 0o600); } catch { /* best effort */ }
    return { publicKey: cur.publicKey, privateKey: cur.privateKey, createdAt: cur.createdAt || null, created: false };
  }
  const k = generate();
  const data = { publicKey: k.publicKey, privateKey: k.privateKey, createdAt: now() };
  writeJson(file, data);
  return { ...data, created: true };
}

/** Validate what a browser's PushSubscription.toJSON() gave us. Throws with .status 400. */
export function cleanSubscription(raw, { allowHost = (h) => PUSH_HOSTS.test(h) } = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  if (!raw || typeof raw !== 'object') throw bad('No subscription');
  const endpoint = String(raw.endpoint || '');
  if (endpoint.length > 1024) throw bad('Endpoint too long');
  let u;
  try { u = new URL(endpoint); } catch { throw bad('Endpoint is not a URL'); }
  // Plain http only for an extra host admitted for tests (a local mock); never a real push service.
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !PUSH_HOSTS.test(u.hostname) && allowHost(u.hostname, u))) throw bad('Endpoint must be https');
  if (!allowHost(u.hostname, u)) throw bad(`Not a known push service: ${u.hostname}`);
  const p256dh = String(raw.keys?.p256dh || '');
  const auth = String(raw.keys?.auth || '');
  if (!B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) throw bad('Bad p256dh key');
  if (!B64URL.test(auth) || auth.length < 16 || auth.length > 32) throw bad('Bad auth secret');
  return { endpoint, keys: { p256dh, auth } };
}

export class PushStore {
  /**
   * @param {object} o
   * @param {string|null} o.file         subscriptions file (null = memory only, for tests)
   * @param {{publicKey, privateKey}} o.vapid
   * @param {string} o.subject           https: URL or mailto:, sent to the push service
   */
  constructor({ file = null, vapid, subject = 'https://ojee.net', fetchImpl = fetch, now = () => Date.now(), allowHost, log = () => {}, retries = 1, retryMs = 2000 }) {
    this.file = file;
    this.retries = retries;
    this.retryMs = retryMs;
    this.vapid = vapid;
    this.subject = subject;
    this.fetch = fetchImpl;
    this.now = now;
    this.allowHost = allowHost || ((h) => PUSH_HOSTS.test(h));
    this.log = log;
    const list = readJson(file, []);
    this.subs = Array.isArray(list) ? list.filter((s) => s && s.endpoint && s.keys) : [];
  }

  get publicKey() { return this.vapid.publicKey; }

  #save() { writeJson(this.file, this.subs); }

  /** What the page sees — no endpoints, no keys. */
  devices() {
    return this.subs.map((s) => ({
      id: s.id, label: s.label, addedAt: s.addedAt, lastOkAt: s.lastOkAt || null,
      lastError: s.lastError || null, lastErrorAt: s.lastErrorAt || null,
      service: (() => { try { return new URL(s.endpoint).hostname; } catch { return '?'; } })(),
    }));
  }

  count() { return this.subs.length; }

  /** Add or refresh a subscription. `replaces` is an old endpoint (pushsubscriptionchange). */
  add(raw, { label = '', ua = '', replaces = null } = {}) {
    const sub = cleanSubscription(raw, { allowHost: this.allowHost });
    const id = deviceId(sub.endpoint);
    const old = replaces ? this.subs.find((s) => s.endpoint === String(replaces)) : null;
    const cur = this.subs.find((s) => s.id === id) || old;
    const name = String(label || cur?.label || 'Browser').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Browser';
    const rec = {
      id, label: name, endpoint: sub.endpoint, keys: sub.keys, ua: String(ua).slice(0, 200),
      addedAt: cur?.addedAt || this.now(), lastOkAt: cur?.lastOkAt || null, lastError: null, lastErrorAt: null, fails: 0,
    };
    this.subs = this.subs.filter((s) => s.id !== id && s !== old);
    this.subs.push(rec);
    while (this.subs.length > MAX_DEVICES) this.subs.shift();
    this.#save();
    return rec;
  }

  rename(id, label) {
    const s = this.subs.find((x) => x.id === id);
    if (!s) return false;
    s.label = String(label || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || s.label;
    this.#save();
    return true;
  }

  remove(id) {
    const n = this.subs.length;
    this.subs = this.subs.filter((s) => s.id !== id);
    if (this.subs.length === n) return false;
    this.#save();
    return true;
  }

  /** One push to one device. Records the outcome on it; a 404/410 removes it. */
  async sendTo(s, ev) {
    const body = payloadOf(ev);
    let details;
    try {
      details = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: s.keys }, body, {
        vapidDetails: { subject: this.subject, publicKey: this.vapid.publicKey, privateKey: this.vapid.privateKey },
        TTL: TTL_SEC,
        urgency: ev.severity === 'critical' || ev.severity === 'warn' ? 'high' : 'normal',
        topic: topicOf(ev.tag || ev.id),
      });
    } catch (e) {
      return this.#outcome(s, { ok: false, error: e.message.slice(0, 120) });
    }
    // One retry on a network failure (never on an answer): the box's uplink
    // drops a connection now and then, and a push that waits 2 s is better
    // than one that is lost.
    for (let attempt = 0; ; attempt += 1) {
      try {
        const r = await this.fetch(details.endpoint, { method: 'POST', headers: details.headers, body: details.body, signal: AbortSignal.timeout(15_000) });
        if (r.status >= 200 && r.status < 300) return this.#outcome(s, { ok: true, status: r.status });
        let why = '';
        try { why = (await r.text()).replace(/\s+/g, ' ').slice(0, 120); } catch { /* none */ }
        return this.#outcome(s, { ok: false, status: r.status, error: why || `HTTP ${r.status}`, gone: r.status === 404 || r.status === 410 });
      } catch (e) {
        if (attempt < this.retries) { await new Promise((ok) => { setTimeout(ok, this.retryMs); }); continue; }
        return this.#outcome(s, { ok: false, error: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || 'network') });
      }
    }
  }

  #outcome(s, r) {
    const live = this.subs.find((x) => x.id === s.id);
    if (live) {
      if (r.ok) { live.lastOkAt = this.now(); live.fails = 0; live.lastError = null; live.lastErrorAt = null; } else {
        live.fails = (live.fails || 0) + 1;
        live.lastError = r.status ? `${r.status} ${r.error}`.slice(0, 140) : r.error;
        live.lastErrorAt = this.now();
      }
      if (r.gone) this.subs = this.subs.filter((x) => x.id !== s.id);
      this.#save();
    }
    return { id: s.id, label: s.label, ...r };
  }

  /**
   * One event to every device (or the given ids).
   * @returns {{ sent, failed, gone, results, summary }} — summary is what the Recent log shows
   */
  async sendAll(ev, { only = null } = {}) {
    const targets = this.subs.filter((s) => !only || only.includes(s.id));
    if (!targets.length) return { sent: 0, failed: 0, gone: 0, results: [], summary: null };
    const results = await Promise.all(targets.map((s) => this.sendTo(s, ev)));
    const sent = results.filter((r) => r.ok).length;
    const gone = results.filter((r) => r.gone).length;
    const failed = results.length - sent - gone;
    const parts = [];
    if (sent) parts.push(`${sent} sent`);
    if (failed) parts.push(`${failed} failed (${results.filter((r) => !r.ok && !r.gone).map((r) => `${r.label}: ${r.status || r.error}`).join(', ')})`.slice(0, 160));
    if (gone) parts.push(`${gone} gone, removed`);
    return { sent, failed, gone, results, summary: `push ${parts.join(' · ')}` };
  }
}
