/* Dahabology service worker.
   Always tries the network first, so prices and pages are never served stale while online.
   Offline, it falls back to the last copy it saw: pages, styles, scripts, and the last price
   snapshots (which keep their original source times, so nothing old is shown as new). */
const CACHE = 'dhb-v6';
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
  const navigation = req.mode === 'navigate';
  // Page variants share one offline copy; a fresh navigation bypasses old HTML at the CDN.
  const key = data || navigation ? url.origin + url.pathname : req;
  let networkRequest = req;
  if (navigation) {
    const fresh = new URL(req.url);
    fresh.searchParams.set('_dhb_page', Date.now().toString());
    networkRequest = new Request(fresh.href, { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' });
  }
  function tagged(res,mode){
    if(!data||!res||res.type==='opaque')return res;
    const headers=new Headers(res.headers);headers.set('X-DHB-Transport',mode);
    if(mode==='network')headers.set('X-DHB-Online-At',new Date().toISOString());
    return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
  }
  const response = fetch(networkRequest).then(async res => {
    // A page URL without its trailing slash is redirected by the host. Hand that redirect to the browser instead of returning a redirected response (which a navigation rejects).
    if (navigation && (res.redirected || (res.status>=300&&res.status<400))) { const to = new URL(res.url || req.url); to.searchParams.delete('_dhb_page'); return Response.redirect(to.href, 302); }
    res=tagged(res,'network');
    if (res.ok) {
      const copy = res.clone();
      await caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(key).then(hit => hit ? tagged(hit,'cache') : Response.error()));
  e.respondWith(
    response
  );
});
