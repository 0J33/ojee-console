/* ============================================================
   ojee-console — service worker. Web Push only.

   It does two things:
     push               show the notification (always — iOS revokes
                        push permission from a site that receives a
                        push and shows nothing, and Chrome shows a
                        generic one of its own instead)
     notificationclick  bring a console forward on the route, or open one

   It deliberately has NO fetch handler and caches nothing: the
   console must always load fresh from the box (the shell is served
   no-store for the same reason). Registered from app.js, scope "/".
   ============================================================ */

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

const ROUTE = /^#\/[A-Za-z0-9_\-/]*$/;

self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { title: 'ojee console', body: e.data ? e.data.text() : '' }; }
  const title = String(p.title || 'ojee console').slice(0, 120);
  const route = typeof p.route === 'string' && ROUTE.test(p.route) ? p.route : '#/';
  const opts = {
    body: String(p.body || '').slice(0, 600),
    tag: String(p.tag || 'ojee'),
    // A repeat of a tag replaces the old one; say so rather than swapping it silently.
    renotify: !!p.tag,
    icon: p.icon || '/icon-192.png',
    badge: '/icon-192.png',
    timestamp: Number(p.at) || Date.now(),
    requireInteraction: p.severity === 'critical',
    data: { route, key: p.key || '' },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const route = e.notification.data?.route || '#/';
  const url = new URL(`/${route}`, self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = wins.filter((c) => new URL(c.url).origin === self.location.origin);
    const win = same.find((c) => c.focused) || same.find((c) => c.visibilityState === 'visible') || same[0];
    if (win) {
      // The page moves its own hash (no reload); focus first, it must come
      // from the click.
      try { await win.focus(); } catch { /* not allowed — still post */ }
      win.postMessage({ type: 'ojee-notify-open', route });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// The push service rotated the subscription: make a new one with the same key
// and tell the console, so the device does not silently fall off the list.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const old = e.oldSubscription;
    const key = old?.options?.applicationServerKey;
    if (!key) return;
    const sub = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await fetch('/api/notify/push/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), replaces: old?.endpoint || null }),
    });
  })().catch(() => {}));
});
