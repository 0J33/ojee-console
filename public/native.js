/* ============================================================
   ojee-console — native bridge.

   Loaded on every page, active only inside the Capacitor wrapper.
   In a normal browser every function here is a no-op, so there is
   exactly one frontend rather than a web build and an app build.

   Two capabilities, both of which are the actual reason to wrap
   the shell at all:

     notifications  local notifications from module events, so a
                    thermal throttle or a device dropping off
                    reaches you without the app being open.

     location       first-party geolocation posted to the home
                    hub in OwnTracks format, replacing the
                    third-party OwnTracks app. The hub's endpoint
                    does not change at all.

   Design note on notifications: the shell must not know what any
   module's events MEAN. A module opts in by emitting an SSE event
   named `notify` with {title, body, tag}. That keeps the contract
   one-directional — the console never parses module state, and a
   module that never emits `notify` simply never notifies.
   ============================================================ */

const native = window.Capacitor?.isNativePlatform?.() === true;
const plugin = (name) => window.Capacitor?.Plugins?.[name] ?? null;

/** True inside the app, false in any browser. Exported so the shell can
 *  label itself honestly rather than guessing from the user agent. */
export const isNative = native;

/* ── notifications ────────────────────────────────────────────────────── */

let notifyId = 1;
const recent = new Map();          // tag → last time we notified for it
const QUIET_MS = 5 * 60 * 1000;

async function ensurePermission() {
  const LocalNotifications = plugin('LocalNotifications');
  if (!LocalNotifications) return false;
  let status = await LocalNotifications.checkPermissions();
  if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
    status = await LocalNotifications.requestPermissions();
  }
  return status.display === 'granted';
}

export async function notify(title, body, tag = title) {
  if (!native) return false;

  // The same condition re-firing every second is the fastest way to make
  // someone turn notifications off for good. One per tag per five minutes.
  const last = recent.get(tag) ?? 0;
  if (Date.now() - last < QUIET_MS) return false;
  recent.set(tag, Date.now());

  const LocalNotifications = plugin('LocalNotifications');
  if (!LocalNotifications || !(await ensurePermission())) return false;

  await LocalNotifications.schedule({
    notifications: [{
      id: notifyId++,
      title,
      body,
      // Tapping it should land on the thing it is about, not the home screen.
      extra: { tag },
      smallIcon: 'ic_stat_icon',
    }],
  });
  return true;
}

/**
 * Subscribe to one module's event stream and forward its `notify` events.
 *
 * Deliberately tolerant: a module that is down, has no /api/events, or never
 * emits `notify` costs one failed EventSource and nothing else.
 */
export function watchModules(modules) {
  const stops = modules
    .filter((m) => m.enabled && m.status === 'ready'
                && (m.capabilities || []).includes('sse'))
    .map((m) => watchModule(m.id));
  return () => stops.forEach((fn) => fn());
}

export function watchModule(moduleId) {
  if (!native) return () => {};

  let source = null;
  let stopped = false;
  let attempt = 0;

  const connect = () => {
    if (stopped) return;
    source = new EventSource(`/${moduleId}/api/events`);
    source.addEventListener('open', () => { attempt = 0; });
    source.addEventListener('notify', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d?.title) notify(d.title, d.body || '', d.tag || `${moduleId}:${d.title}`);
      } catch { /* a module sending malformed json is not worth a crash */ }
    });
    source.addEventListener('error', () => {
      source.close();
      if (stopped) return;
      const wait = Math.min(1000 * 2 ** attempt, 60000);
      attempt += 1;
      setTimeout(connect, wait);
    });
  };

  connect();
  return () => { stopped = true; source?.close(); };
}

/**
 * Notify when a module's health flips. The shell already polls /api/modules
 * every 20s for the nav, so this rides along rather than adding traffic.
 */
const health = new Map();

export function noteModuleHealth(modules) {
  if (!native) return;
  for (const m of modules) {
    if (!m.enabled) continue;
    const was = health.get(m.id);
    const now = m.status === 'ready';
    health.set(m.id, now);
    // The first sweep establishes a baseline; notifying on it would fire for
    // every module every time the app cold-starts.
    if (was === undefined || was === now) continue;
    if (now) notify(`${m.name} is back`, 'The module is responding again.', `health:${m.id}`);
    else notify(`${m.name} is unreachable`, m.reason || 'The module stopped responding.', `health:${m.id}`);
  }
}

/* ── location ─────────────────────────────────────────────────────────── */

let watchId = null;

/**
 * Post fixes to the home hub in OwnTracks format.
 *
 * The hub's /api/location has accepted this shape since before this app
 * existed — zones, arrive/leave triggers and all — so this replaces the
 * OwnTracks app with no backend change whatsoever. Mounted, the console
 * proxies it and asserts identity, so no location token is needed here.
 */
export async function startLocation({ moduleId = 'home', minMetres = 50 } = {}) {
  if (!native || watchId) return false;

  const Geolocation = plugin('Geolocation');
  const Device = plugin('Device');
  if (!Geolocation) return false;

  const perm = await Geolocation.requestPermissions().catch(() => null);
  if (!perm || perm.location === 'denied') return false;

  let last = null;

  watchId = await Geolocation.watchPosition(
    { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 },
    async (pos, err) => {
      if (err || !pos) return;
      const { latitude, longitude, accuracy } = pos.coords;

      // Don't post a fix that says the same thing as the last one. A phone
      // sitting on a desk emits a fix a second; the hub only cares about
      // movement, and every post is a wakeup on both ends.
      if (last && haversine(last.lat, last.lon, latitude, longitude) < minMetres) return;
      last = { lat: latitude, lon: longitude };

      let batt;
      try {
        const info = await Device?.getBatteryInfo?.();
        if (info?.batteryLevel != null) batt = Math.round(info.batteryLevel * 100);
      } catch { /* battery info is optional */ }

      await fetch(`/${moduleId}/api/location`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          _type: 'location',
          lat: latitude,
          lon: longitude,
          acc: Math.round(accuracy ?? 0),
          tst: Math.round((pos.timestamp ?? Date.now()) / 1000),
          t: 'u',                       // OwnTracks: reported by the app itself
          ...(batt == null ? {} : { batt }),
        }),
      }).catch(() => { /* offline; the next fix will carry the position */ });
    },
  );
  return true;
}

export async function stopLocation() {
  if (!watchId) return;
  await plugin('Geolocation')?.clearWatch({ id: watchId });
  watchId = null;
}

/** Metres between two coordinates. */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ── chrome ───────────────────────────────────────────────────────────── */

/** Hide the status bar overlap and dismiss the splash once the shell paints. */
export async function ready() {
  if (!native) return;
  try {
    await plugin('StatusBar')?.setStyle({ style: 'DARK' });
    await plugin('StatusBar')?.setBackgroundColor({ color: '#08080e' });
  } catch { /* not every platform has a themeable status bar */ }
  try {
    await plugin('SplashScreen')?.hide();
  } catch { /* no splash configured */ }
}
