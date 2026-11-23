const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'); let checks = 0; const ok = (x, m) => { assert.ok(x, m); checks++ };
const root = path.join(__dirname, 'dist'), out = '/downloads/dahab-tabs'; fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0])); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  try {
    for (const width of [320, 390, 1280]) {
      const c = await b.newContext({ viewport: { width, height: 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' });
      await c.route('https://**/*', r => r.abort());
      const p = await c.newPage();
      p.on('pageerror', e => { throw new Error('pageerror: ' + e.message); });

      await p.goto(base + '/market/');
      ok(await p.locator('#tab-market').getAttribute('aria-selected') === 'true', 'market tab selected by default');
      ok(await p.locator('#pane-market').isVisible(), 'market pane visible');
      ok(!await p.locator('#pane-analysis').isVisible(), 'analysis pane hidden at load');
      ok(!await p.locator('#pane-live').isVisible(), 'live pane hidden at load');
      ok((await p.locator('.x-top h1').textContent()).includes('سعر الذهب الآن'), 'h1 market');
      ok(!await p.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('analytics.js'))), 'analytics not loaded for plain market visit');
      ok(await p.evaluate(() => document.scrollingElement.scrollWidth) <= width + 1, 'no horizontal overflow');
      const bar = await p.locator('.market-tabs').boundingBox();
      ok(bar.x >= 0 && bar.x + bar.width <= width + 1, 'tab bar within width');
      ok(bar.height >= 44, 'tab bar touch height');
      await p.screenshot({ path: out + '/tab-market-' + width + '.png' });

      await p.click('#tab-analysis');
      ok(await p.locator('#pane-analysis').isVisible(), 'analysis pane opens on click');
      ok(!await p.locator('#pane-market').isVisible(), 'market pane hides');
      ok((await p.locator('.x-top h1').textContent()).includes('تحليل الذهب'), 'h1 switches to analysis');
      ok((await p.title()).includes('تحليل الذهب'), 'title switches to analysis');
      ok(await p.url().includes('#analysis'), 'hash follows tab');
      await p.waitForFunction(() => document.getElementById('analysisDate').textContent.includes('تحليل اليوم'));
      await p.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.includes('analytics.js')), null, { timeout: 5000 });
      ok(true, 'analytics lazy-loaded on first analysis activation');
      await p.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.includes('ui.js')), null, { timeout: 5000 });
      ok(true, 'ui.js follows analytics');
      ok((await p.locator('#analysisFxBasis').textContent()).includes('غير متاح'), 'offline FX shows honest unavailable basis, no crash');
      await p.screenshot({ path: out + '/tab-analysis-' + width + '.png' });

      await p.click('#tab-live');
      ok(await p.locator('#pane-live').isVisible(), 'live pane opens');
      ok(!await p.locator('#pane-analysis').isVisible(), 'analysis pane hides');
      ok((await p.locator('.x-top h1').textContent()).includes('الرسم الحي'), 'h1 switches to live');
      ok((await p.title()).includes('XAUUSD'), 'title switches to live');
      ok((await p.locator('#liveChartStatus').textContent()).includes('انتظار'), 'live chart waiting state without data');
      await p.screenshot({ path: out + '/tab-live-' + width + '.png' });

      await p.click('#tab-market');
      ok(await p.locator('#pane-market').isVisible(), 'market pane returns');
      ok((await p.locator('.x-top h1').textContent()).includes('سعر الذهب الآن'), 'h1 restored');
      ok(!await p.locator('#heroPrice').isHidden(), 'hero price still rendered after tab round trip');

      await p.locator('#tab-market').focus();
      await p.keyboard.press('ArrowLeft');
      ok(await p.locator('#pane-analysis').isVisible(), 'RTL arrow-left opens next tab');
      ok(await p.evaluate(() => document.activeElement.id === 'tab-analysis'), 'focus moved with arrow');
      await p.keyboard.press('End');
      ok(await p.locator('#pane-live').isVisible(), 'End jumps to last tab');

      /* Fixed bottom chrome (dock + Tut launcher) must never make pane content unreachable:
         after a tab click the tab bar lands below the sticky header, and at full scroll every
         pane's last element rises fully above both overlays. */
      for (const tab of ['market', 'analysis', 'live']) {
        await p.click('#tab-' + tab);
        const hdrBottom = await p.evaluate(() => document.querySelector('header.x-top').getBoundingClientRect().bottom);
        const barBox = await p.locator('.market-tabs').boundingBox();
        ok(barBox.y >= hdrBottom - 1, 'tab bar lands below the sticky header after clicking ' + tab + ' (' + width + 'px)');
        await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        const clear = await p.evaluate(tab => {
          const last = document.getElementById('pane-' + tab).lastElementChild.getBoundingClientRect();
          const coveredBy = sel => {
            const el = document.querySelector(sel);
            if (!el || getComputedStyle(el).display === 'none') return false;
            const r = el.getBoundingClientRect();
            return last.left < r.right && last.right > r.left && last.bottom > r.top;
          };
          return { dock: coveredBy('.x-dock'), launcher: coveredBy('.help-launcher') };
        }, tab);
        ok(!clear.dock, 'bottom of ' + tab + ' pane fully clears the dock at full scroll (' + width + 'px)');
        ok(!clear.launcher, 'bottom of ' + tab + ' pane fully clears the Tut launcher at full scroll (' + width + 'px)');
        if (width < 600) ok(await p.evaluate(() => {
          const f = (document.querySelector('footer > .wrap') || document.querySelector('footer')).getBoundingClientRect();
          const blockedBy = sel => {
            const el = document.querySelector(sel);
            if (!el || getComputedStyle(el).display === 'none') return false;
            const r = el.getBoundingClientRect();
            return f.left < r.right && f.right > r.left && f.bottom > r.top;
          };
          return !blockedBy('.x-dock') && !blockedBy('.help-launcher');
        }), 'footer links fully clear the dock and Tut launcher at full scroll (' + width + 'px)');
        if (width < 600) await p.screenshot({ path: out + '/bottom-' + tab + '-' + width + '.png' });
      }
      await p.click('#tab-analysis');
      await p.waitForFunction(() => document.getElementById('analysisDate').textContent.includes('تحليل اليوم'));
      await p.locator('.x-reads').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      ok(await p.evaluate(() => {
        const r = document.querySelector('.x-reads').getBoundingClientRect();
        const blockedBy = sel => {
          const el = document.querySelector(sel);
          if (!el || getComputedStyle(el).display === 'none') return false;
          const o = el.getBoundingClientRect();
          return r.left < o.right && r.right > o.left && r.bottom > o.top && r.top < o.bottom;
        };
        return r.top >= 0 && r.bottom <= innerHeight && !blockedBy('.x-dock') && !blockedBy('.help-launcher');
      }), 'analysis market-readings row center-scrolls fully clear of fixed chrome (' + width + 'px)');

      const p2 = await c.newPage();
      await p2.goto(base + '/market/#live');
      await p2.waitForSelector('#pane-live:not([hidden])');
      ok(true, 'deep link /market/#live opens live pane at load');
      ok(!await p2.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1), 'no overflow on deep link');
      await p2.close();

      const p3 = await c.newPage();
      await p3.goto(base + '/analysis/');
      await p3.waitForURL(u => u.pathname.endsWith('/market/') && u.hash === '#analysis', { timeout: 5000 });
      await p3.waitForSelector('#pane-analysis:not([hidden])');
      ok(true, '/analysis/ redirects to the analysis tab');
      ok((await p3.locator('.x-top h1').textContent()).includes('تحليل الذهب'), 'redirected page shows analysis identity');
      await p3.close();

      const p4 = await c.newPage();
      await p4.goto(base + '/live/');
      await p4.waitForURL(u => u.pathname.endsWith('/market/') && u.hash === '#live', { timeout: 5000 });
      await p4.waitForSelector('#pane-live:not([hidden])');
      ok(true, '/live/ redirects to the live tab');
      await p4.close();

      const p5 = await c.newPage();
      await p5.goto(base + '/wallet/');
      await p5.click('.x-dock summary');
      const hrefs = await p5.locator('.x-more-menu a').evaluateAll(as => as.map(a => a.getAttribute('href')));
      ok(hrefs.some(h => h.includes('market/#analysis')), 'dock المزيد links التحليل directly to the tab');
      ok(hrefs.some(h => h.includes('market/#live')), 'dock المزيد links الرسم الحي directly to the tab');
      await p5.close();

      await p.close(); await c.close();
    }

    /* Blocked lazy bundle (offline first activation): explicit connection-needed state with a
       working retry after reconnect - never a silent shell or fake reading. */
    {
      const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await c.route('https://**/*', r => r.abort());
      await c.route('**/js/analytics.js*', r => r.abort());
      const p = await c.newPage();
      p.on('pageerror', e => { throw new Error('pageerror: ' + e.message); });
      await p.goto(base + '/market/');
      await p.click('#tab-analysis');
      await p.waitForSelector('#analysisLoadNote:not([hidden])', { timeout: 8000 });
      ok(true, 'blocked analytics shows the explicit connection-needed note');
      ok((await p.locator('#analysisLoadNote').textContent()).includes('تعذّر تحميل التحليل'), 'note wording is honest Arabic');
      ok(await p.locator('#analysisRetry').isVisible(), 'retry button offered');
      ok((await p.locator('#analysisNow').textContent()).trim() === '—' && (await p.locator('#analysisDayState').textContent()).includes('انتظار'), 'no reading rendered while the bundle is blocked (waiting text + dashes, plus the note)');
      await p.screenshot({ path: out + '/analysis-offline-note-390.png' });
      await c.unroute('**/js/analytics.js*');
      await p.click('#analysisRetry');
      await p.waitForFunction(() => document.getElementById('analysisFxBasis').textContent.length > 2, null, { timeout: 8000 });
      ok(true, 'retry after reconnect loads the analysis');
      ok(await p.locator('#analysisLoadNote').isHidden(), 'note hides after successful retry');
      ok((await p.locator('#analysisFxBasis').textContent()).includes('غير متاح'), 'offline FX basis stays honest after retry');
      await p.close(); await c.close();
    }
    console.log(checks + ' market tab assertions passed.');
  } finally { await b.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
