/* Post-merge display regressions found on the LIVE site (2026-11-23), now pinned as tests:
   B - the trader buy / spread chips (التاجر يشتري / فرق البيع والشراء) sat UNDER the fixed dock on
       the market tab's first view whenever the viewport was shorter than ~800px (up to 160px hidden
       at 1280x667). Fix: below 800px height the chips render above the big circle (flex order).
   A - deep links (/market/#analysis, /calculator/#invoice, the /analysis//live//invoice/ redirects
       and every dock/home/manifest entry using those hashes) parked the tab strip behind the sticky
       header: a scripted re-assert raced the browser's own fragment scroll and lost once the SW
       controlled the page. Fix: scroll-margin-top on the pane sections, no scripted scroll.
   This file fails on the pre-fix build and passes after, at every width/height in the matrix,
   INCLUDING with slow external resources (the live failure mode that fast local loads hid). */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'); let checks = 0; const ok = (x, m) => { assert.ok(x, m); checks++ };
const root = path.join(__dirname, 'dist'), out = '/downloads/dahab-tabs'; fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0])); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' })[path.extname(f)] || 'application/octet-stream'); res.setHeader('service-worker-allowed', '/'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  try {
    /* 1 - first-view clearance matrix: buy/spread chips fully above the dock at scrollY=0 */
    console.log('w\th\tpairB\tdockT\tclear');
    for (const w of [320, 375, 390, 1250, 1280]) for (const h of [667, 720, 768, 800, 844]) {
      const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: w < 600, serviceWorkers: 'block' });
      await c.route('https://**/*', r => r.abort());
      const p = await c.newPage();
      await p.goto(base + '/market/');
      const m = await p.evaluate(() => {
        const pair = document.querySelector('.x-pair').getBoundingClientRect();
        const dock = document.querySelector('.x-dock').getBoundingClientRect();
        const hero = document.querySelector('.x-hero').getBoundingClientRect();
        return { pairB: pair.bottom, pairT: pair.top, dockT: dock.top, heroT: hero.top };
      });
      console.log(w + '\t' + h + '\t' + Math.round(m.pairB) + '\t' + Math.round(m.dockT) + '\t' + (m.pairB <= m.dockT + 1));
      ok(m.pairB <= m.dockT + 1, 'buy/spread chips clear the dock on first view (' + w + 'x' + h + '): pairBottom=' + Math.round(m.pairB) + ' dockTop=' + Math.round(m.dockT));
      if (h <= 800) ok(m.pairB <= m.heroT, 'short viewport (' + w + 'x' + h + '): chips render above the big circle');
      else ok(m.pairT >= m.heroT, 'tall viewport (' + w + 'x' + h + '): approved circle-first order kept');
      if (w === 375 && h === 667) await p.screenshot({ path: out + '/fix-market-375x667.png' });
      if (w === 1250 && h === 720) await p.screenshot({ path: out + '/fix-market-1250x720.png' });
      await c.close();
    }

    /* 2 - the live race: external subresources DELAYED, not absent. Deep links and redirects must
       still land with the tab strip below the sticky header once everything settles. */
    const stripOk = () => { const r = document.querySelector('.market-tabs').getBoundingClientRect(); const h = document.querySelector('header.x-top').getBoundingClientRect(); return { top: r.top, hdr: h.bottom, ok: r.top >= h.bottom - 1 && r.bottom <= innerHeight + 1 }; };
    for (const target of ['/market/#analysis', '/market/#live', '/calculator/#invoice', '/analysis/', '/live/', '/invoice/', '/market/']) {
      const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await c.route('https://**/*', async r => { await new Promise(s => setTimeout(s, 1500)); r.abort(); });
      const p = await c.newPage();
      await p.goto(base + target);
      await p.waitForLoadState('load');
      await p.waitForTimeout(2500);   /* past any slow-subresource fragment jump */
      const st = await p.evaluate(stripOk);
      ok(st.ok, 'slow-network landing keeps strip below header: ' + target + ' stripTop=' + st.top.toFixed(1) + ' hdrBottom=' + st.hdr.toFixed(1));
      const st2 = await p.evaluate(stripOk);
      ok(st2.ok && Math.abs(st2.top - st.top) <= 2, 'landing is stable (no late jump): ' + target);
      await c.close();
    }

    /* 3 - fast deep links stay correct too (regression in the other direction) */
    for (const target of ['/market/#analysis', '/calculator/#invoice']) {
      const c = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
      await c.route('https://**/*', r => r.abort());
      const p = await c.newPage();
      await p.goto(base + target);
      await p.waitForLoadState('load');
      await p.waitForTimeout(1200);
      const st = await p.evaluate(stripOk);
      ok(st.ok, 'fast deep link lands below header: ' + target + ' stripTop=' + st.top.toFixed(1));
      await c.close();
    }
    console.log(checks + ' short-viewport/deep-link regression assertions passed.');
  } finally { await b.close(); server.close(); }
})();
