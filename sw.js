/* KYPZER service worker — works offline without ever mixing versions.
 * App code (HTML/JS/CSS): network-first, cached copy when offline — a redeploy never pairs a new
 * main.js with an old lazily-loaded module.
 * Immutable things (vendored three.js, icons, Google Fonts): stale-while-revalidate.
 */
const VERSION = 'kypzer-v2.0.1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/intro.css',
  './css/landing.css',
  './css/app.css',
  './css/focus.css',
  './css/print.css',
  './src/main.js',
  './src/core/dom.js',
  './src/core/store.js',
  './src/core/router.js',
  './src/core/sound.js',
  './src/engine/plan.js',
  './src/engine/parser.js',
  './src/engine/resolver.js',
  './src/engine/scheduler.js',
  './src/engine/analyzer.js',
  './src/engine/lexicon.js',
  './src/engine/time.js',
  './src/engine/energy.js',
  './src/engine/format.js',
  './src/engine/week.js',
  './src/ui/app.js',
  './src/ui/icons.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => null)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return res;
    })
    .catch(() => caches.match(request));
}

function swr(request) {
  return caches.open(VERSION).then((cache) =>
    cache.match(request).then((hit) => {
      const net = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }
  const immutable = /\/vendor\/|\/assets\//.test(url.pathname) || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (immutable) event.respondWith(swr(req));
  else if (url.origin === location.origin) event.respondWith(networkFirst(req));
});
