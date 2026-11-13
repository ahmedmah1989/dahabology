/* Dahabology service worker.
   Always tries the network first, so prices and pages are never served stale while online.
   Offline, it falls back to the last copy it saw: pages, styles, scripts, and the last price
   snapshots (which keep their original source times, so nothing old is shown as new). */
const CACHE = 'dhb-v4';
const isData = u => /\/data\/[\w-]+\.json$/.test(u.pathname);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), data = isData(url);
  if (url.origin !== location.origin && !data) return;          // other sites (charts, fonts, gold API) are left alone
  const key = data ? url.origin + url.pathname : req;           // data requests carry a cache-busting ?t=
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then(hit => hit || Response.error()))
  );
});
