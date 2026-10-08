/* ============================================================
   ojee-console — app notifications, on this device.

   The console server decides what reaches "the app" (Settings →
   Notifications). Every open console — the phone app, the desktop
   app on the laptop, a browser tab — listens on /api/notify/stream
   and shows each event the way its platform can:

     phone app     a local notification (Capacitor), tap opens the route
     desktop app   a system notification (Electron, web Notification API);
                   clicking brings the window forward on the route
     browser       a system notification when the tab is in the
                   background and permission is granted; a toast when
                   you are looking at it

   Per device, it can be switched off here (localStorage) without
   touching the shared settings. Two tabs of one browser show an
   event once: they agree through localStorage which one does.
   ============================================================ */

import * as nativeBridge from '/native.js';

const KEY_ON = 'ojee.notify.device';
const KEY_SEEN = 'ojee.notify.seen';
const me = Math.random().toString(36).slice(2);
const historyFns = new Set();
let source = null;
let toastFn = () => {};
let attempt = 0;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

export const isDesktopApp = () => !!window.ojeeDesktop || /\bElectron\//.test(navigator.userAgent);
export const deviceKind = () => (nativeBridge.isNative ? 'phone app' : isDesktopApp() ? 'desktop app' : 'browser');
export const deviceEnabled = () => store.get(KEY_ON) !== 'off';
export const setDeviceEnabled = (on) => store.set(KEY_ON, on ? 'on' : 'off');

/** 'granted' | 'denied' | 'default'/'prompt' | 'unavailable' */
export async function permission() {
  if (nativeBridge.isNative) return nativeBridge.notificationStatus();
  return 'Notification' in window ? Notification.permission : 'unavailable';
}

export async function requestPermission() {
  if (nativeBridge.isNative) return nativeBridge.requestNotifications();
  if (!('Notification' in window)) return 'unavailable';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

export function onHistory(fn) { historyFns.add(fn); return () => historyFns.delete(fn); }
export const connected = () => !!source && source.readyState === 1;

/** Only one tab of this browser shows a given event. */
function claim(key) {
  return new Promise((resolve) => {
    const k = `ojee.notify.k.${key}`;
    if (store.get(k)) { resolve(false); return; }
    store.set(k, me);
    setTimeout(() => resolve(store.get(k) === me), 40);
    // Old claims are swept now and then.
    if (Math.random() < 0.1) {
      try {
        const old = Object.keys(localStorage).filter((x) => x.startsWith('ojee.notify.k.'));
        for (const x of old.slice(0, Math.max(0, old.length - 50))) store.del(x);
      } catch { /* fine */ }
    }
  });
}

function go(route) {
  if (typeof route === 'string' && route.startsWith('#/')) location.hash = route;
}

async function show(ev) {
  if (!ev?.title) return;
  const seen = Number(store.get(KEY_SEEN)) || 0;
  if (ev.at > seen) store.set(KEY_SEEN, String(ev.at));
  if (!deviceEnabled()) return;
  if (!(await claim(ev.key || `${ev.id}:${ev.at}`))) return;
  const level = ev.severity === 'critical' ? 'err' : ev.severity === 'warn' ? 'warn' : 'info';

  if (nativeBridge.isNative) {
    // In the foreground iOS still shows it as a banner (presentationOptions),
    // so there is no second, in-page copy.
    const ok = await nativeBridge.notify(ev.title, ev.body || '', { route: ev.route, severity: ev.severity, tag: ev.tag });
    if (!ok) toastFn(level, ev.title, ev.body || '');
    return;
  }
  const looking = document.visibilityState === 'visible' && document.hasFocus();
  if (!looking && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(ev.title, { body: ev.body || '', tag: ev.tag || ev.id, icon: '/icon-192.png', silent: ev.severity === 'info' });
      n.onclick = () => {
        // The desktop app's window may be hidden in the tray: ask it to come back.
        try { window.ojeeDesktop?.show?.(); } catch { /* not the desktop app */ }
        window.focus();
        go(ev.route);
        n.close();
      };
      return;
    } catch { /* some browsers only allow it from a service worker — fall through */ }
  }
  toastFn(level, ev.title, ev.body || '');
}

/** Start listening. Safe to call once per page. */
export function start({ toast } = {}) {
  if (toast) toastFn = toast;
  if (source) return;
  nativeBridge.onNotificationTap(go);
  const connect = () => {
    const since = Number(store.get(KEY_SEEN)) || 0;
    source = new EventSource(`/api/notify/stream${since ? `?since=${since}` : ''}`);
    source.addEventListener('open', () => { attempt = 0; });
    source.addEventListener('notify', (e) => { try { show(JSON.parse(e.data)); } catch { /* malformed */ } });
    source.addEventListener('history', (e) => { try { const r = JSON.parse(e.data); for (const fn of historyFns) fn(r); } catch { /* malformed */ } });
    source.addEventListener('error', () => {
      // EventSource retries by itself, but not after a 401 or a dead proxy;
      // close and come back on our own clock.
      source.close();
      source = null;
      const wait = Math.min(60_000, 2000 * 2 ** attempt);
      attempt += 1;
      setTimeout(() => { if (!source) connect(); }, wait);
    });
  };
  connect();
  // A phone app coming back from the background: its stream died while it
  // was suspended. Reconnect at once, and catch up on what was missed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!source || source.readyState === 2)) {
      try { source?.close(); } catch { /* closed */ }
      source = null;
      attempt = 0;
      connect();
    }
  });
}
