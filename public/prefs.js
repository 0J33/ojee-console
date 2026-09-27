/* ============================================================
   ojee-console — display preferences.

   Two things about this console are a matter of taste rather than of
   fact: whether a clock reads 12- or 24-hour, and which language the
   watch's day wheel is printed in. Both are read in more than one place
   — the chronometer, the idle display, the movement — so they live here
   rather than in whichever of them happened to need them first.

   Stored per browser. A console that forgot which clock you read every
   time you reloaded it would be worse than not offering the choice.
   ============================================================ */

const KEY = 'ojee.console.display';

const DEFAULTS = {
  // 12-hour with a meridiem. This console is read at a glance from across
  // a room, and "7:45 PM" is one fewer subtraction than "19:45".
  clock24: false,
  // 'en' or 'ar'. A 7S26 day wheel is bilingual; this is which half of it
  // is showing.
  dayLang: 'en',
  // The idle display dims at night, between these hours (local, 0-23).
  nightDim: true,
  nightFrom: 23,
  nightTo: 6,
};

const state = { ...DEFAULTS };
const listeners = new Set();

try {
  const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
  if (typeof raw.clock24 === 'boolean') state.clock24 = raw.clock24;
  if (raw.dayLang === 'en' || raw.dayLang === 'ar') state.dayLang = raw.dayLang;
  if (typeof raw.nightDim === 'boolean') state.nightDim = raw.nightDim;
  for (const k of ['nightFrom', 'nightTo']) {
    if (Number.isInteger(raw[k]) && raw[k] >= 0 && raw[k] <= 23) state[k] = raw[k];
  }
} catch { /* a console with no storage still has defaults */ }

export const prefs = () => ({ ...state });

/** One value, without allocating a copy — for callers reading per frame. */
export const pref = (key) => state[key];

export function setPref(key, value) {
  if (!(key in DEFAULTS) || state[key] === value) return;
  state[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* nothing to do */ }
  for (const fn of listeners) { try { fn(prefs()); } catch { /* one bad listener is not the others' problem */ } }
}

/** Subscribe. Returns the unsubscribe. */
export function onPrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Another tab is the same console. */
addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  try {
    const raw = JSON.parse(e.newValue || '{}');
    let hit = false;
    for (const k of Object.keys(DEFAULTS)) {
      if (raw[k] !== undefined && raw[k] !== state[k]) { state[k] = raw[k]; hit = true; }
    }
    if (hit) for (const fn of listeners) { try { fn(prefs()); } catch { /* as above */ } }
  } catch { /* nothing to do */ }
});
