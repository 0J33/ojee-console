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

   Web Push (public/sw.js): a browser that subscribed in Settings →
   Notifications — the console added to an iPhone's Home Screen,
   desktop Chrome/Edge/Firefox, Chrome on Android — is reached even
   when no console is open, and its service worker shows every
   notification. Such a page does not ALSO show the stream's copy:
   the service worker already did.

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

let pushOn = false;          // this browser holds a push subscription the server knows

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
  // The service worker shows it (it gets the same event by Web Push).
  if (pushOn && !nativeBridge.isNative && 'Notification' in window && Notification.permission === 'granted') return;
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

/* ── Web Push ───────────────────────────────────────────────────── */

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || (window.matchMedia?.('(display-mode: standalone)').matches ?? false);

/**
 * Whether this page may use Web Push at all. Not inside the phone app
 * (Capacitor) or the desktop app (Electron): those keep their own delivery.
 * @returns {{ ok: boolean, why: string|null, ios: boolean, standalone: boolean }}
 */
export function pushSupport() {
  const ios = isIOS();
  const sa = standalone();
  if (nativeBridge.isNative || isDesktopApp()) return { ok: false, why: 'app', ios, standalone: sa };
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return { ok: false, why: 'insecure', ios, standalone: sa };
  if (!('PushManager' in window) || !('Notification' in window)) {
    // iOS exposes push only to a Home Screen web app (16.4+).
    return { ok: false, why: ios && !sa ? 'ios-browser' : 'unsupported', ios, standalone: sa };
  }
  return { ok: true, why: null, ios, standalone: sa };
}

/** Register the service worker. Quietly does nothing where push does not apply. */
export async function registerWorker() {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || nativeBridge.isNative || isDesktopApp()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  } catch { return null; }
}

/** sha256(endpoint), base64url, 16 chars — the server names devices the same way. */
export async function deviceIdOf(endpoint) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  let s = '';
  for (const b of d) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 16);
}

const b64urlToBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const sameKey = (a, b) => a && b && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('/')) || registerWorker();
}

/** This browser's push subscription (or null) and its device id. */
export async function pushState() {
  const reg = await registration().catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  return { sub, id: sub ? await deviceIdOf(sub.endpoint) : null };
}

/** A name for this device, from the user agent. The person can change it. */
export function guessLabel() {
  const ua = navigator.userAgent;
  if (isIOS()) return `${/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad' : 'iPhone'}${standalone() ? ' (Home Screen)' : ''}`;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}${standalone() ? ' (app)' : ''}`;
}

/**
 * Subscribe this browser. MUST be called straight from a tap: iOS only asks
 * for permission inside a user gesture, so the permission request is the
 * first thing that happens, before anything is awaited.
 */
export async function enablePush({ publicKey, label }) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: perm === 'denied' ? 'Notifications are blocked for this site — allow them in the system or browser settings.' : 'Permission was not given.' };
  const reg = await registration();
  if (!reg) return { ok: false, error: 'The service worker could not be registered.' };
  await navigator.serviceWorker.ready;
  const key = b64urlToBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // One made with another key (the box made a new pair) can never be delivered to.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  try {
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch (e) { return { ok: false, error: `The browser refused to subscribe: ${e.message}` }; }
  const r = await fetch('/api/notify/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), label }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
  pushOn = true;
  return { ok: true, id: j.id, view: j };
}

/** Unsubscribe this browser (and forget it on the server). */
export async function disablePush() {
  const { sub, id } = await pushState();
  if (sub) await sub.unsubscribe().catch(() => {});
  pushOn = false;
  if (id) await fetch(`/api/notify/push/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  return id;
}

export const pushActive = () => pushOn;

/**
 * At start: is this browser subscribed, and does the server still know it,
 * with the key it has now? A subscription removed elsewhere (or made with an
 * old key) is dropped here too, so the page goes back to showing the stream.
 */
async function syncPush() {
  if (!pushSupport().ok) return;
  await registerWorker();
  const { sub, id } = await pushState();
  if (!sub) { pushOn = false; return; }
  try {
    const r = await fetch('/api/notify/push', { cache: 'no-store' });
    if (!r.ok) { pushOn = Notification.permission === 'granted'; return; }
    const j = await r.json();
    const known = j.devices?.some((d) => d.id === id);
    if (!known || !sameKey(sub.options?.applicationServerKey, b64urlToBytes(j.publicKey))) {
      await sub.unsubscribe().catch(() => {});
      pushOn = false;
      return;
    }
    pushOn = Notification.permission === 'granted';
  } catch { pushOn = Notification.permission === 'granted'; }
}

/** Start listening. Safe to call once per page. */
export function start({ toast } = {}) {
  if (toast) toastFn = toast;
  if (source) return;
  nativeBridge.onNotificationTap(go);
  syncPush().catch(() => {});
  // A tap on a pushed notification while a console is open: the worker
  // focused this window and asks it to move to the route.
  if ('serviceWorker' in navigator && !nativeBridge.isNative) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'ojee-notify-open') go(e.data.route);
    });
  }
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
