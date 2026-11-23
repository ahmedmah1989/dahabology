/* What can automation establish about the installed-app (PWA) risk of the screen merges?
   Two builds are served from one origin, switched mid-test to simulate a deploy:
   OLD = released baseline 6360a236 (ASSET_VERSION oldsha000000), NEW = candidate bee4653
   (ASSET_VERSION testmerge123, /analysis/ and /live/ are redirect stubs).
   Scenarios: A online upgrade freshness, B offline fallback after upgrade, C fresh device
   offline with no cache, D offline device that only ever saw the old build. */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'); let checks = 0; const ok = (x, m) => { assert.ok(x, m); checks++ };
const OLD = '/tmp/dahab-baseline/dist', NEW = '/tmp/dahab-corrections/dist';
let root = OLD;
const server = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' })[path.extname(f)] || 'application/octet-stream');
  res.setHeader('service-worker-allowed', '/');
  res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  try {
    const mk = async () => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await c.route('https://**/*', r => r.abort()); return c; };
    const swReady = p => p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });

    /* A - online upgrade: a navigation after the deploy must serve NEW html, never stale cache */
    {
      const c = await mk(); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(base + '/analysis/'); await swReady(p);
      await p.reload(); await swReady(p);   // first load installs the SW; the reload is intercepted and cached
      ok(await p.locator('.market-tabs').count() === 0, 'A1 old build /analysis/ is the standalone page (no tabs)');
      ok((await p.locator('.x-top h1').textContent()).trim() === 'التحليل', 'A2 old analysis identity');
      ok(await p.evaluate(async () => (await caches.open('dhb-v6')).keys().then(ks => ks.some(k => k.url.endsWith('/analysis/') || k.url.includes('/analysis/?') || new URL(k.url).pathname.endsWith('/analysis/')))), 'A3 old SW cached /analysis/');
      const oldScript = await p.evaluate(() => navigator.serviceWorker.controller.scriptURL);
      ok(oldScript.includes('oldsha000000'), 'A4 controlling SW is the old versioned one');
      root = NEW;  // ---- deploy happens here ----
      await p.goto(base + '/analysis/');
      await p.waitForURL(u => u.pathname.endsWith('/market/') && u.hash === '#analysis', { timeout: 10000 });
      ok(true, 'A5 after deploy, installed-app navigation to /analysis/ redirects to the merged tab');
      await p.waitForSelector('.market-tabs');
      ok(await p.locator('#pane-analysis').isVisible(), 'A6 merged analysis pane renders post-upgrade');
      try {
        await p.waitForFunction(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.includes('testmerge123'), null, { timeout: 10000 });
        ok(true, 'A7 new versioned SW took control (no stale worker)');
      } catch (_) {
        const diag = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { controller: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL, active: r && r.active && r.active.scriptURL, installing: !!(r && r.installing), waiting: !!(r && r.waiting) }; });
        ok(false, 'A7 new SW did not take control within 10s: ' + JSON.stringify(diag));
      }
      ok(errs.length === 0, 'A8 no page errors during online upgrade: ' + errs.join(' | '));
      await c.close();
    }

    /* B - offline after upgrade: merged page and the stub both work from cache */
    {
      const c = await mk(); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(base + '/market/'); await swReady(p);
      await p.click('#tab-analysis');
      await p.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.includes('analytics.js')), null, { timeout: 8000 });
      await p.goto(base + '/analysis/'); await p.waitForURL(u => u.hash === '#analysis'); // cache the stub copy too
      await p.waitForTimeout(600);
      await c.setOffline(true);
      await p.goto(base + '/market/#analysis');
      await p.waitForSelector('#pane-analysis:not([hidden])', { timeout: 10000 });
      ok(true, 'B1 offline deep link /market/#analysis opens the analysis pane from cache');
      ok((await p.locator('#analysisFxBasis').textContent()).length > 3, 'B2 offline analysis shows its honest basis wording, not a crash');
      await p.goto(base + '/analysis/');
      await p.waitForURL(u => u.pathname.endsWith('/market/') && u.hash === '#analysis', { timeout: 10000 });
      ok(await p.locator('#pane-analysis').isVisible(), 'B3 offline /analysis/ stub redirects into the cached merged page');
      ok(errs.length === 0, 'B4 no page errors offline: ' + errs.join(' | '));
      await c.close();
    }

    /* C - fresh device, offline, never cached: fails honestly, no fake content */
    {
      const c = await mk(); const p = await c.newPage();
      await c.setOffline(true);
      let failed = false;
      try { await p.goto(base + '/market/', { timeout: 8000 }); } catch (e) { failed = true; }
      ok(failed || await p.evaluate(() => !document.querySelector('.x-hero')), 'C1 never-cached offline navigation shows no market content (honest failure, browser offline page)');
      await c.close();
    }

    /* D - device that only ever saw the OLD build goes offline after the deploy: old copy still works */
    {
      root = OLD;
      const c = await mk(); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(base + '/analysis/'); await swReady(p);
      await p.reload(); await swReady(p);   // populate the old cache under SW control
      await p.goto(base + '/market/'); await p.waitForTimeout(400);
      root = NEW;                 // deploy happens while the device is "away"
      await c.setOffline(true);   // ...and it never comes online again before opening the app
      await p.goto(base + '/analysis/');
      await p.waitForSelector('.x-top h1');
      ok((await p.locator('.x-top h1').textContent()).includes('تحليل'), 'D1 offline old-cache device still gets a working analysis page (previous version, source times intact)');
      ok(errs.length === 0, 'D2 old cached version runs without errors: ' + errs.join(' | '));
      await c.close();
      root = NEW;
    }

    /* E - offline first-ever analysis tap (the reviewer's case): explicit connection-needed
       state with retry, no indefinite waiting dashes; cached offline analysis preserved. */
    {
      const c = await mk(); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(base + '/market/'); await swReady(p);
      await p.reload(); await swReady(p);   // cache the market page under SW control, WITHOUT opening analysis
      await c.setOffline(true);
      await p.goto(base + '/market/#analysis');
      await p.waitForSelector('#analysisLoadNote:not([hidden])', { timeout: 10000 });
      ok(true, 'E1 offline first activation shows the connection-needed state, not silent dashes');
      ok(await p.locator('#analysisRetry').isVisible(), 'E2 retry offered in the offline state');
      await c.setOffline(false);
      try { await p.click('#analysisRetry', { timeout: 1500 }); ok(true, 'E3 manual retry clicked after reconnect'); }
      catch (_) { ok(true, 'E3 auto-retry on the online event beat the manual click (self-healing)'); }
      await p.waitForFunction(() => document.getElementById('analysisFxBasis').textContent.length > 2, null, { timeout: 10000 });
      ok(true, 'E4 analysis filled after reconnect');
      ok(errs.length === 0, 'E5 no page errors: ' + errs.join(' | '));
      await c.close();
    }

    console.log(checks + ' PWA upgrade/offline assertions passed.');
  } finally { await b.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
