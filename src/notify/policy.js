/**
 * Notification policy — pure, no I/O, so it is tested on its own and can be
 * copied verbatim into anything that has to apply the same rules while the
 * console is out of reach (the Claude runner on the laptop does).
 *
 *   effective(prefs, type)          the person's choice over the type's default
 *   inQuiet(quiet, now, tz)         inside quiet hours?
 *   decide(prefs, type, ev, ctx)    { app, discord, why } for one event
 *
 * A type comes from a module's catalogue:
 *   { id, label, severity: 'info'|'warn'|'critical', defaultChannels: ['app','discord'],
 *     cooldownMin?, discordBy?: 'module' }
 */

export const SEVERITIES = ['info', 'warn', 'critical'];
export const DEFAULT_COOLDOWN_MIN = 5;

/** "HH:MM" -> minutes since midnight, or null. */
export const toMin = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
};

/** Minutes since local midnight in a zone. */
export function localMinutes(now, tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Quiet hours, which may run across midnight (23:00–07:00). */
export function inQuiet(quiet, now, tz) {
  if (!quiet?.on) return false;
  const a = toMin(quiet.from); const b = toMin(quiet.to);
  if (a === null || b === null || a === b) return false;
  const m = localMinutes(now, tz);
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/** One type's settings: what was chosen, else the catalogue's default. */
export function effective(prefs, type) {
  const p = prefs?.types?.[type.id] || {};
  const ch = Array.isArray(type.defaultChannels) ? type.defaultChannels : ['app'];
  const cd = Number.isFinite(Number(p.cooldownMin)) && p.cooldownMin !== null && p.cooldownMin !== ''
    ? Math.max(0, Math.min(1440, Number(p.cooldownMin)))
    : (Number.isFinite(type.cooldownMin) ? type.cooldownMin : DEFAULT_COOLDOWN_MIN);
  const params = {};
  for (const x of type.params || []) params[x.key] = x.default;
  return {
    app: typeof p.app === 'boolean' ? p.app : ch.includes('app'),
    discord: typeof p.discord === 'boolean' ? p.discord : ch.includes('discord'),
    cooldownMin: cd,
    params: { ...params, ...(p.params && typeof p.params === 'object' ? p.params : {}) },
  };
}

/**
 * What happens to one event.
 * @param {object} prefs   { quiet, types }
 * @param {object} type    the catalogue entry
 * @param {object} ev      { tag, severity }
 * @param {object} c       { now, tz, last: Map<key, ms> } — `last` is updated when anything is sent
 * @returns {{ app: boolean, discord: boolean, why: string|null, key: string }}
 */
export function decide(prefs, type, ev, { now = Date.now(), tz, last = new Map() } = {}) {
  const t = effective(prefs, type);
  const key = `${type.id}|${ev.tag || ''}`;
  const out = (app, discord, why) => ({ app, discord, why, key });
  if (!t.app && !t.discord) return out(false, false, 'off');
  const sev = SEVERITIES.includes(ev.severity) ? ev.severity : (type.severity || 'info');
  if (inQuiet(prefs?.quiet, now, tz) && !(sev === 'critical' && prefs?.quiet?.critical)) return out(false, false, 'quiet');
  const prev = last.get(key);
  if (prev && t.cooldownMin > 0 && now - prev < t.cooldownMin * 60_000) return out(false, false, 'cooldown');
  last.set(key, now);
  return out(t.app, t.discord, null);
}
