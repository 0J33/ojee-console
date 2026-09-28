/* ============================================================
   ojee-console — the watch's complications: a stopwatch, timers,
   and the other time zones worth keeping.

   All of it runs on reference time (timesync.now), and all of it is
   stored as instants rather than as counters: a stopwatch is "started
   at T with A already on it", a timer is "ends at T". So a reload, a
   different page, or a laptop that slept through the end of a timer
   all come back to the right answer — nothing here counts ticks.

   Stored per browser, like the display preferences.

   A timer that ends says so wherever you are in the console: a toast,
   three short tones, and a system notification when the tab is not
   the one in front. It cannot ring with the page closed — nothing in
   a browser can — which is why this has timers and not alarms.
   ============================================================ */

import * as timesync from '/timesync.js';

const KEY = 'ojee.console.watch';
const MAX_ZONES = 12;
const MAX_TIMERS = 6;

const state = {
  sw: { runningSince: null, acc: 0, laps: [] },     // laps: cumulative ms at each lap
  timers: [],                                       // { id, label, durMs, endAt|null, leftMs, done }
  zones: [],                                        // { id, zone: IANA name, name: the owner's label or '' }
};
const listeners = new Set();
let alertFn = () => {};

try {
  const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
  if (raw.sw && typeof raw.sw.acc === 'number') {
    state.sw = { runningSince: Number.isFinite(raw.sw.runningSince) ? raw.sw.runningSince : null,
                 acc: raw.sw.acc, laps: Array.isArray(raw.sw.laps) ? raw.sw.laps.filter(Number.isFinite).slice(-99) : [] };
  }
  if (Array.isArray(raw.timers)) state.timers = raw.timers.filter((t) => t && Number.isFinite(t.durMs)).slice(0, MAX_TIMERS);
  if (Array.isArray(raw.zones)) state.zones = readZones(raw.zones);
} catch { /* no storage: everything still works for this visit */ }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* nothing to do */ }
  for (const fn of listeners) { try { fn(); } catch { /* not ours */ } }
  schedule();
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* Another tab is the same console: a timer started there shows here. */
addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  try {
    const raw = JSON.parse(e.newValue || '{}');
    Object.assign(state, { sw: raw.sw || state.sw, timers: raw.timers || [], zones: readZones(raw.zones || []) });
    for (const fn of listeners) fn();
    schedule();
  } catch { /* ignore */ }
});

/* ── stopwatch ─────────────────────────────────────────────────────────── */

export const stopwatch = {
  elapsed() {
    const s = state.sw;
    return s.acc + (s.runningSince !== null ? timesync.now() - s.runningSince : 0);
  },
  get running() { return state.sw.runningSince !== null; },
  get laps() { return state.sw.laps.slice(); },
  /** Whether there is anything on it at all — the hand shows only then. */
  get active() { return state.sw.runningSince !== null || state.sw.acc > 0; },
  start() { if (state.sw.runningSince === null) { state.sw.runningSince = timesync.now(); save(); } },
  stop() {
    if (state.sw.runningSince === null) return;
    state.sw.acc += timesync.now() - state.sw.runningSince;
    state.sw.runningSince = null;
    save();
  },
  lap() { if (state.sw.runningSince !== null) { state.sw.laps.push(this.elapsed()); state.sw.laps = state.sw.laps.slice(-99); save(); } },
  reset() { state.sw = { runningSince: null, acc: 0, laps: [] }; save(); },
};

/* ── timers ────────────────────────────────────────────────────────────── */

const newId = () => Math.random().toString(36).slice(2, 9);

export const timers = {
  list() { return state.timers.map((t) => ({ ...t, left: timers.left(t) })); },
  left(t) {
    if (t.done) return 0;
    return t.endAt !== null ? Math.max(0, t.endAt - timesync.now()) : t.leftMs;
  },
  add(durMs, label = '') {
    const d = Math.round(Number(durMs));
    if (!(d >= 1000 && d <= 24 * 3600_000)) return null;
    if (state.timers.length >= MAX_TIMERS) state.timers.shift();
    const t = { id: newId(), label: String(label).slice(0, 40), durMs: d, endAt: timesync.now() + d, leftMs: d, done: false };
    state.timers.push(t);
    save();
    return t.id;
  },
  pause(id) {
    const t = state.timers.find((x) => x.id === id);
    if (!t || t.done || t.endAt === null) return;
    t.leftMs = Math.max(0, t.endAt - timesync.now()); t.endAt = null; save();
  },
  resume(id) {
    const t = state.timers.find((x) => x.id === id);
    if (!t || t.done || t.endAt !== null) return;
    t.endAt = timesync.now() + t.leftMs; save();
  },
  extend(id, ms) {
    const t = state.timers.find((x) => x.id === id);
    if (!t) return;
    if (t.done) { t.done = false; t.endAt = timesync.now() + ms; t.durMs = ms; }
    else if (t.endAt !== null) { t.endAt += ms; t.durMs += ms; }
    else { t.leftMs += ms; t.durMs += ms; }
    save();
  },
  restart(id) {
    const t = state.timers.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, { done: false, endAt: timesync.now() + t.durMs, leftMs: t.durMs });
    save();
  },
  remove(id) { state.timers = state.timers.filter((x) => x.id !== id); save(); },
};

/* One timeout, for whichever timer ends first — not a ticker. */
let due = 0;
function schedule() {
  clearTimeout(due);
  const next = state.timers.filter((t) => !t.done && t.endAt !== null).sort((a, b) => a.endAt - b.endAt)[0];
  if (!next) return;
  // Capped, so a laptop that slept is caught within a minute of waking.
  due = setTimeout(check, Math.min(60_000, Math.max(0, next.endAt - timesync.now())));
}
function check() {
  const now = timesync.now();
  const ended = state.timers.filter((t) => !t.done && t.endAt !== null && t.endAt <= now + 30);
  for (const t of ended) { t.done = true; t.leftMs = 0; }
  if (ended.length) { save(); for (const t of ended) alertFn(t); }
  else schedule();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

/** What happens when a timer ends; the shell supplies the toast. */
export function onTimerEnd(fn) { alertFn = fn; check(); }

/** Three short tones. Built in the page: no file to fetch, nothing to fail. */
export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const t0 = ac.currentTime + 0.02;
    for (let i = 0; i < 3; i += 1) {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1318.5 : 1046.5;
      const t = t0 + i * 0.28;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + 0.26);
    }
    setTimeout(() => ac.close().catch(() => {}), 1500);
  } catch { /* no audio here */ }
}

/* ── time zones ────────────────────────────────────────────────────────── */

export function validZone(z) {
  if (typeof z !== 'string' || !z) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; }
}

/* Zones were once bare IANA names; they are now entries with a name of their
   own, so the same zone can be kept twice ("Mum", "Office") and told apart. */
function readZones(raw) {
  return raw.map((z, i) => (typeof z === 'string' ? { id: `z${Date.now().toString(36)}${i}`, zone: z, name: '' } : z))
    .filter((z) => z && typeof z.id === 'string' && validZone(z.zone))
    .map((z) => ({ id: z.id, zone: z.zone, name: String(z.name || '').slice(0, 40) }))
    .slice(0, MAX_ZONES);
}

export const zones = {
  list() { return state.zones.map((z) => ({ ...z })); },
  get max() { return MAX_ZONES; },
  add(z, name = '') {
    if (!validZone(z) || state.zones.length >= MAX_ZONES) return false;
    state.zones.push({ id: `z${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, zone: z, name: String(name).trim().slice(0, 40) });
    save(); return true;
  },
  has(z) { return state.zones.some((x) => x.zone === z); },
  rename(id, name) {
    const z = state.zones.find((x) => x.id === id);
    const n = String(name || '').trim().slice(0, 40);
    if (!z || z.name === n) return;
    z.name = n; save();
  },
  remove(id) { state.zones = state.zones.filter((x) => x.id !== id); save(); },
  all() {
    try { return Intl.supportedValuesOf('timeZone'); } catch { return []; }
  },
};

/* A zone's offset from UTC in minutes at an instant, from the platform's own
   tz database. Cached a minute a zone: it is asked every frame. */
const offCache = new Map();
const fmtCache = new Map();
export function zoneOffsetMin(zone, ms) {
  const key = `${zone}|${Math.floor(ms / 60_000)}`;
  const hit = offCache.get(zone);
  if (hit && hit.key === key) return hit.min;
  let f = fmtCache.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }); fmtCache.set(zone, f); }
  const name = f.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  const min = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  offCache.set(zone, { key, min });
  return min;
}

/**
 * A clock for a zone that the watch model can read as if it were local:
 * the model asks the Date for its hours, so the instant is shifted by the
 * difference between that zone and this device's.
 */
export function zoneClock(zone) {
  return () => {
    const t = timesync.now();
    const local = -new Date(t).getTimezoneOffset();
    return t + (zoneOffsetMin(zone, t) - local) * 60_000;
  };
}

/** "+2h", "−5h30", or "same time" against this device. */
export function zoneDiff(zone) {
  const t = timesync.now();
  const d = zoneOffsetMin(zone, t) + new Date(t).getTimezoneOffset();
  if (!d) return 'same time';
  const sign = d > 0 ? '+' : '−';
  const a = Math.abs(d);
  return `${sign}${Math.floor(a / 60)}h${a % 60 ? String(a % 60).padStart(2, '0') : ''}`;
}

export const zoneCity = (z) => (z.split('/').pop() || z).replace(/_/g, ' ');

/* ── formatting ────────────────────────────────────────────────────────── */

/** 1:02:03.45 / 2:03.45 — centiseconds, the way a stopwatch reads. */
export function fmtStopwatch(ms) {
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
  return `${body}.${String(cs).padStart(2, '0')}`;
}

/** 1:02:03 / 4:05 — a timer's time left, rounded up so it never shows 0:00 early. */
export function fmtTimer(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}

schedule();
