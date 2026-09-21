/* ============================================================
   ojee-console — reference time for the browser.

   `new Date()` is whatever this device believes, and devices are
   routinely a second or more out. Every clock in the console reads
   from here instead: the console server, which itself measures its
   offset from UTC over NTP (src/time.js), queried the way NTP
   queries a server —

     note when we asked (t0) and when the answer landed (t1),
     assume it was stamped halfway, keep the sample with the
     shortest round trip, because it has the least room to lie.

   Time is kept on the monotonic clock (performance.now) plus a
   measured offset, so an OS clock step mid-session cannot jerk the
   display. Re-synced every ten minutes and whenever the tab comes
   back, since a sleeping laptop can stop the monotonic clock.
   ============================================================ */

const SAMPLES = 5;
const RESYNC_MS = 10 * 60_000;

const mono = () => performance.timeOrigin + performance.now();

const state = {
  offset: 0,          // ms to add to the monotonic wall estimate
  rtt: null,          // best round trip to the console, ms
  ntp: null,          // the server's own measurement against NTP
  synced: false,
  syncedAt: 0,
  error: null,
};
const listeners = new Set();
let inflight = null, timer = null, started = false;

async function sample() {
  const t0 = performance.now();
  const res = await fetch('/api/time', { cache: 'no-store', headers: { accept: 'application/json' } });
  const t1 = performance.now();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return { offset: body.t - (performance.timeOrigin + (t0 + t1) / 2), rtt: t1 - t0, ntp: body.ntp };
}

export async function sync() {
  if (inflight) return inflight;
  inflight = (async () => {
    const got = [];
    for (let i = 0; i < SAMPLES; i++) {
      try { got.push(await sample()); } catch (e) { state.error = e.message; }
    }
    if (got.length) {
      const best = got.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      Object.assign(state, { offset: best.offset, rtt: best.rtt, ntp: best.ntp,
                             synced: true, syncedAt: Date.now(), error: null });
    }
    listeners.forEach((fn) => fn(info()));
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Reference time: ms since the Unix epoch. Device time until the first sync lands. */
export function now() {
  return state.synced ? mono() + state.offset : Date.now();
}

/**
 * What the page says about the time it shows.
 *   accuracyMs  worst-case error: half our round trip plus the server's own
 *   deviceMs    how far THIS device's clock is from the reference (+ fast, − slow)
 */
export function info() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const verified = !!state.ntp?.verified;
  const accuracyMs = state.synced
    ? Math.round(state.rtt / 2 + (verified ? state.ntp.errMs : 0))
    : null;
  return {
    synced: state.synced,
    verified,
    accuracyMs,
    deviceMs: state.synced ? Math.round(Date.now() - now()) : null,
    ntp: state.ntp,
    zone,
    error: state.error,
    syncedAt: state.syncedAt,
  };
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Start syncing. Idempotent: every clock calls it; only the first does anything. */
export function start() {
  if (started) return;
  started = true;
  sync();
  timer = setInterval(sync, RESYNC_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  addEventListener('online', () => sync());
}

/* ── formatting ───────────────────────────────────────────────────────── */

const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtOffset = new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' });
const fmtAbbr = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' });

/** Local wall-clock fields for a reference instant, in this device's zone. */
export function parts(ms) {
  const d = new Date(ms);
  const [hh, mm, ss] = fmtTime.format(d).split(':');
  return { hh, mm, ss, h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds(), date: d };
}

export const hms = (ms) => fmtTime.format(new Date(ms));
export const longDate = (ms) => fmtDate.format(new Date(ms));
const fmtShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
/** "Tue 22 Sep 2026" — the date where a cell is narrow. */
export const shortDate = (ms) => fmtShort.format(new Date(ms)).replace(/,/g, '');

/** "UTC+3", "UTC−4:30", "UTC" — from the zone's current offset. */
export function utcOffset(ms) {
  const raw = fmtOffset.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = raw.match(/GMT([+-])?(\d+)?(?::(\d+))?/);
  if (!m || !m[1]) return 'UTC';
  return `UTC${m[1] === '-' ? '−' : '+'}${m[2]}${m[3] ? `:${m[3]}` : ''}`;
}

/** A letter abbreviation (EEST, BST) when the zone has one, else null. */
export function zoneAbbr(ms) {
  const v = fmtAbbr.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || '';
  return /^[A-Z]{2,5}$/.test(v) ? v : null;
}

/** ISO 8601 week number. */
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

export function dayOfYear(d) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
}

/** "Africa/Cairo" → "Cairo", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export const zoneCity = (zone) => (zone.split('/').pop() || zone).replace(/_/g, ' ');
