// Service worker for Index Dashboard, based on kit/sw-template.js (Dashboard-Kit 1.0.0).
// Shell: network first, cached copy offline. data/*.json: network first, last good copy as fallback (the page then
// says "Offline · Updated …"). Only caches named kit-index-* are touched; the origin is shared with other apps.
const APP = 'index';
const VERSION = '2026-11-20.2';
const PREFIX = `kit-${APP}-`;
const CACHE = PREFIX + VERSION;
const DATA_CACHE = PREFIX + 'data';

const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'kit/kit.css', 'kit/kit.js', 'assets/style.css', 'assets/app.js', 'assets/info.js', 'assets/refresh.js', 'icons/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))))
      .then(() => caches.open(DATA_CACHE))
      .then(cache => cache.add(new Request('data/latest.json', { cache: 'reload' })).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                                   // live third-party data: network only
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;   // another app on this origin
  if (url.pathname.endsWith('/sw.js')) return;
  if (/\/data\/[^/]+\.json$/i.test(url.pathname)) event.respondWith(networkFirst(req, DATA_CACHE, true));
  else event.respondWith(networkFirst(req, CACHE, false));
});

async function networkFirst(req, name, data) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(data ? req.url.split('?')[0] : req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(data ? req.url.split('?')[0] : req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./');
      if (shell) return shell;
    }
    return Response.error();
  }
}
