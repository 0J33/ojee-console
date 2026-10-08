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

   Design note on notifications: the shell does not decide what is
   worth notifying, or whether. Modules emit `notify` events; the
   console server routes them (Settings -> Notifications: per type,
   quiet hours, cooldowns) and sends the ones meant for the app over
   /api/notify/stream. public/notify.js listens and calls notify()
   here, which is only "show this as a local notification".

   What a local notification cannot do: arrive while the app is fully
   closed. There is no push service behind a sideloaded build (no
   APNs, no FCM), so a closed app hears nothing; Discord is the
   channel for that, and the stream replays what was missed when the
   app comes back.
   ============================================================ */

const native = window.Capacitor?.isNativePlatform?.() === true;
const plugin = (name) => window.Capacitor?.Plugins?.[name] ?? null;

/** True inside the app, false in any browser. Exported so the shell can
 *  label itself honestly rather than guessing from the user agent. */
export const isNative = native;

/* ── notifications ────────────────────────────────────────────────────── */

const platform = () => window.Capacitor?.getPlatform?.() || 'web';
let nextId = (Date.now() % 1_000_000) * 100;
let channelsReady = null;

/** Android 8+ files every notification under a channel the person can tune
    in system settings. Two: warnings that should interrupt, and the rest. */
function ensureChannels() {
  if (channelsReady) return channelsReady;
  const LN = plugin('LocalNotifications');
  channelsReady = (async () => {
    if (!LN || platform() !== 'android') return;
    try {
      await LN.createChannel({ id: 'ojee-alerts', name: 'Alerts', description: 'Problems and warnings: a machine in trouble, an illness warning, a session that needs you.', importance: 4, visibility: 1, vibration: true, lights: true, lightColor: '#FFFFFF' });
      await LN.createChannel({ id: 'ojee-updates', name: 'Updates', description: 'Summaries and nudges: morning readiness, the weekly check-in, a finished task.', importance: 3, visibility: 1, vibration: false });
    } catch { /* older Android: no channels */ }
  })();
  return channelsReady;
}

/** 'granted' | 'denied' | 'prompt' | 'unavailable' — inside the app only. */
export async function notificationStatus() {
  const LN = plugin('LocalNotifications');
  if (!native || !LN) return 'unavailable';
  try {
    const s = await LN.checkPermissions();
    return s.display === 'granted' ? 'granted' : s.display === 'denied' ? 'denied' : 'prompt';
  } catch { return 'unavailable'; }
}

/** Ask once. On Android 13+ this is the POST_NOTIFICATIONS runtime dialog;
    on iOS the system prompt. A "denied" can only be undone in system settings. */
export async function requestNotifications() {
  const LN = plugin('LocalNotifications');
  if (!native || !LN) return 'unavailable';
  try {
    const s = await LN.requestPermissions();
    await ensureChannels();
    return s.display === 'granted' ? 'granted' : s.display === 'denied' ? 'denied' : 'prompt';
  } catch { return 'unavailable'; }
}

/**
 * Show one local notification.
 * @param {string} title
 * @param {string} body
 * @param {object} o { route: '#/health/today', severity, tag }
 */
export async function notify(title, body, { route = null, severity = 'info', tag = null } = {}) {
  if (!native) return false;
  const LN = plugin('LocalNotifications');
  if (!LN) return false;
  let status = await notificationStatus();
  if (status === 'prompt') status = await requestNotifications();
  if (status !== 'granted') return false;
  await ensureChannels();
  nextId = (nextId + 1) % 2_000_000_000;
  await LN.schedule({
    notifications: [{
      id: nextId,
      title,
      body,
      largeBody: body,
      // Tapping it lands on the screen it is about (see onNotificationTap).
      extra: { route, tag },
      smallIcon: 'ic_stat_icon',
      iconColor: '#FFFFFF',
      channelId: severity === 'info' ? 'ojee-updates' : 'ojee-alerts',
      threadIdentifier: tag ? String(tag).split(':')[0] : undefined,
    }],
  });
  return true;
}

/** Call `fn(route)` when a notification is tapped (the app opens or comes forward). */
export function onNotificationTap(fn) {
  const LN = plugin('LocalNotifications');
  if (!native || !LN) return () => {};
  let handle = null;
  LN.addListener('localNotificationActionPerformed', (a) => {
    const route = a?.notification?.extra?.route;
    if (typeof route === 'string' && route.startsWith('#/')) fn(route);
  }).then((h) => { handle = h; }).catch(() => {});
  return () => handle?.remove?.();
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
    await plugin('StatusBar')?.setBackgroundColor({ color: '#000000' });
  } catch { /* not every platform has a themeable status bar */ }
  try {
    await plugin('SplashScreen')?.hide();
  } catch { /* no splash configured */ }
}
