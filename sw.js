/* Farm Project Tracker — minimal service worker.
 * Network-first for navigations/assets so testing always gets fresh files,
 * with a cache fallback for offline use. Bump CACHE to invalidate. */
var CACHE = 'fpt-cache-v3';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/store.js',
  './js/qrcode.js',
  './js/app.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
        return resp;
      })
      .catch(function () {
        return caches.match(e.request).then(function (m) { return m || caches.match('./index.html'); });
      })
  );
});
