/* Farm Project Tracker — service worker: web push, notification clicks, and
   offline app-shell caching. */
const CACHE = 'farm-cache-v2';
const SHELL = ['/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Offline strategy:
//  - Navigations: network-first, falling back to the cached page or a minimal
//    offline shell.
//  - Writes are never intercepted here. The app queues them itself (see
//    lib/client/outbox.ts) because it can attach an idempotency key and show
//    the user what's pending — a Background Sync replay from the worker could
//    do neither.
//  - Static build assets: stale-while-revalidate for instant repeat loads.
//  - Everything else (API, SSE, uploads): straight to the network, uncached.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API responses

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<body style="font-family:system-ui;padding:40px;text-align:center;color:#333">' +
              '<h1 style="font-size:20px">🌾 Offline</h1>' +
              '<p>You&rsquo;re offline and this page hasn&rsquo;t been opened on this device yet.</p>' +
              '<p style="color:#666;font-size:14px">Pages you&rsquo;ve already visited still work, and anything you ' +
              'save there syncs once you&rsquo;re back in range.</p></body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }
  const title = data.title || 'Farm Tracker';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
