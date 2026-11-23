/* Formal stage-2 suite: merged calculator/invoice tabs at 320/390/1280 - default state,
   switching, identity, lazy tools.js, deep links, redirect, selected/unselected state,
   RTL keyboard, bottom clearance vs dock + Tut launcher, blocked-bundle note + retry. */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'); let checks = 0; const ok = (x, m) => { assert.ok(x, m); checks++ };
const root = path.join(__dirname, 'dist'), out = '/downloads/dahab-tabs';
const server = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0])); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  try {
    for (const width of [320, 390, 1280]) {
      const c = await b.newContext({ viewport: { width, height: 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' });
      await c.route('https://**/*', r => r.abort());
      const p = await c.newPage();
      p.on('pageerror', e => { throw new Error('pageerror: ' + e.message); });

      await p.goto(base + '/calculator/');
      ok(await p.locator('#tab-calculator').getAttribute('aria-selected') === 'true', 'calculator tab default (' + width + 'px)');
      ok(await p.locator('#pane-calculator').isVisible(), 'calc pane visible (' + width + 'px)');
      ok(!await p.locator('#pane-invoice').isVisible(), 'invoice pane hidden at load (' + width + 'px)');
      ok(!await p.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('tools.js'))), 'tools.js NOT loaded for plain calculator visit (' + width + 'px)');
      ok((await p.locator('.x-top h1').textContent()).trim() === 'الحاسبة', 'h1 calculator (' + width + 'px)');
      ok(!await p.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1), 'no horizontal overflow (' + width + 'px)');
      const tabStyle = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('tab-calculator')), u = getComputedStyle(document.getElementById('tab-invoice')); return { sel: s.backgroundImage, unsel: u.backgroundImage, selColor: s.color, unselColor: u.color }; });
      ok(tabStyle.sel.includes('linear-gradient'), 'selected tab shows the gold gradient (' + width + 'px)');
      ok(!tabStyle.unsel.includes('linear-gradient'), 'unselected tab is not gold (' + width + 'px)');
      ok(tabStyle.selColor !== tabStyle.unselColor, 'selected and unselected tab colors differ (' + width + 'px)');
      if (width === 390) await p.screenshot({ path: out + '/tab-calculator-390.png' });

      await p.fill('#cAmount', '100000');
      await p.click('#tab-invoice');
      ok(await p.locator('#pane-invoice').isVisible(), 'invoice pane opens (' + width + 'px)');
      ok((await p.locator('.x-top h1').textContent()).trim() === 'افحص الفاتورة', 'h1 switches to invoice (' + width + 'px)');
      ok((await p.title()).includes('فاتورة'), 'title switches to invoice (' + width + 'px)');
      ok(await p.url().includes('#invoice'), 'hash follows tab (' + width + 'px)');
      await p.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.includes('tools.js')), null, { timeout: 5000 });
      ok(true, 'tools.js lazy-loaded on first invoice activation (' + width + 'px)');
      ok((await p.locator('#invVerdict').textContent()).includes('اكتب الوزن'), 'invoice verdict placeholder renders (' + width + 'px)');
      if (width === 390) await p.screenshot({ path: out + '/tab-invoice-390.png' });
      await p.fill('#invGrams', '8'); await p.fill('#invTotal', '49500');
      ok(await p.locator('#invDonut').isVisible(), 'invoice donut visible after input (' + width + 'px)');
      await p.click('#tab-calculator');
      ok((await p.locator('#cAmount').inputValue()) === '100000', 'calculator input survives tab round trip (' + width + 'px)');
      ok((await p.locator('.x-top h1').textContent()).trim() === 'الحاسبة', 'h1 restored (' + width + 'px)');

      await p.locator('#tab-calculator').focus();
      await p.keyboard.press('ArrowLeft');
      ok(await p.locator('#pane-invoice').isVisible(), 'RTL arrow-left opens the invoice tab (' + width + 'px)');
      ok(await p.evaluate(() => document.activeElement.id === 'tab-invoice'), 'focus moved with arrow (' + width + 'px)');
      await p.keyboard.press('ArrowRight');
      ok(await p.locator('#pane-calculator').isVisible(), 'arrow-right returns to الحاسبة (' + width + 'px)');

      /* Fixed bottom chrome must never make either pane's content unreachable. */
      for (const tab of ['calculator', 'invoice']) {
        await p.click('#tab-' + tab);
        const hdrBottom = await p.evaluate(() => document.querySelector('header.x-top').getBoundingClientRect().bottom);
        const barBox = await p.locator('.market-tabs').boundingBox();
        ok(barBox.y >= hdrBottom - 1, 'tab bar lands below the sticky header after clicking ' + tab + ' (' + width + 'px)');
        await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        const clear = await p.evaluate(tab => {
          const blockedBy = (rect, sel) => {
            const el = document.querySelector(sel);
            if (!el || getComputedStyle(el).display === 'none') return false;
            const r = el.getBoundingClientRect();
            return rect.left < r.right && rect.right > r.left && rect.bottom > r.top;
          };
          const last = document.getElementById('pane-' + tab).lastElementChild.getBoundingClientRect();
          const fw = (document.querySelector('footer > .wrap') || document.querySelector('footer')).getBoundingClientRect();
          return { dock: blockedBy(last, '.x-dock'), launcher: blockedBy(last, '.help-launcher'), fDock: blockedBy(fw, '.x-dock'), fLauncher: blockedBy(fw, '.help-launcher') };
        }, tab);
        ok(!clear.dock, 'bottom of ' + tab + ' pane fully clears the dock at full scroll (' + width + 'px)');
        ok(!clear.launcher, 'bottom of ' + tab + ' pane fully clears the Tut launcher at full scroll (' + width + 'px)');
        if (width < 600) {
          ok(!clear.fDock, 'footer links fully clear the dock at full scroll (' + width + 'px)');
          ok(!clear.fLauncher, 'footer links fully clear the Tut launcher at full scroll (' + width + 'px)');
          await p.screenshot({ path: out + '/bottom-' + tab + '-' + width + '.png' });
        }
      }

      const p2 = await c.newPage();
      await p2.goto(base + '/calculator/#invoice');
      await p2.waitForSelector('#pane-invoice:not([hidden])');
      ok(true, 'deep link /calculator/#invoice opens invoice pane at load (' + width + 'px)');
      await p2.waitForFunction(() => { const r = document.querySelector('.market-tabs').getBoundingClientRect(); const h = document.querySelector('header.x-top').getBoundingClientRect(); return r.top >= h.bottom - 1 && r.top < 200 && r.bottom <= innerHeight; }, null, { timeout: 5000 });
      ok(true, 'deep link lands with the tab strip visible below the sticky header (' + width + 'px)');
      if (width === 390) await p2.screenshot({ path: out + '/deeplink-invoice-390.png' });
      await p2.click('#tab-calculator');
      ok(await p2.locator('#pane-calculator').isVisible(), 'switching to الحاسبة works from a direct invoice entry (' + width + 'px)');
      await p2.close();

      /* Same-document fragment navigation (dock/assistant links while already on the page):
         the UA smooth-scrolls the pane anchor; assert the SETTLED strip position, not the
         transient one (regression found by final review: strip ended under the header). */
      const p4 = await c.newPage();
      await p4.goto(base + '/calculator/');
      await p4.waitForSelector('.market-tabs');
      const settledStrip = () => { const r = document.querySelector('.market-tabs').getBoundingClientRect(); const h = document.querySelector('header.x-top').getBoundingClientRect(); return { top: r.top, hdr: h.bottom, ok: r.top >= h.bottom - 1 && r.top < 200 && r.bottom <= innerHeight }; };
      await p4.evaluate(() => { window.location.hash = 'invoice'; });
      await p4.waitForSelector('#pane-invoice:not([hidden])');
      ok(true, 'same-document hash nav opens the invoice pane (' + width + 'px)');
      await p4.waitForTimeout(2600);
      let st = await p4.evaluate(settledStrip);
      ok(st.ok, 'SETTLED strip below sticky header after same-doc #invoice nav (' + width + 'px): stripTop=' + st.top.toFixed(1) + ' hdrBottom=' + st.hdr.toFixed(1));
      if (width === 390) await p4.screenshot({ path: out + '/samedoc-invoice-390.png' });
      await p4.evaluate(() => { window.location.hash = 'calculator'; });
      await p4.waitForSelector('#pane-calculator:not([hidden])');
      await p4.waitForTimeout(2600);
      st = await p4.evaluate(settledStrip);
      ok(st.ok, 'SETTLED strip below sticky header after same-doc #calculator nav back (' + width + 'px): stripTop=' + st.top.toFixed(1) + ' hdrBottom=' + st.hdr.toFixed(1));
      await p4.close();

      const p3 = await c.newPage();
      await p3.goto(base + '/invoice/');
      await p3.waitForURL(u => u.pathname.endsWith('/calculator/') && u.hash === '#invoice', { timeout: 5000 });
      await p3.waitForSelector('#pane-invoice:not([hidden])');
      ok(true, '/invoice/ redirects to the invoice tab (' + width + 'px)');
      ok((await p3.locator('.x-top h1').textContent()).trim() === 'افحص الفاتورة', 'redirected page shows invoice identity (' + width + 'px)');
      await p3.close();

      await p.close(); await c.close();
    }

    /* Blocked lazy bundle (offline first activation): explicit note + retry, never a silent shell. */
    {
      const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await c2.route('https://**/*', r => r.abort());
      await c2.route('**/js/tools.js*', r => r.abort());
      const q = await c2.newPage();
      q.on('pageerror', e => { throw new Error('pageerror: ' + e.message); });
      await q.goto(base + '/calculator/#invoice');
      await q.waitForSelector('#invoiceLoadNote:not([hidden])', { timeout: 8000 });
      ok(true, 'blocked tools.js shows the connection-needed note');
      ok((await q.locator('#invoiceLoadNote').textContent()).includes('تعذّر تحميل فحص الفاتورة'), 'invoice note wording honest');
      ok(await q.locator('#invoiceRetry').isVisible(), 'invoice retry offered');
      await q.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await q.screenshot({ path: out + '/invoice-offline-note-390.png' });
      await c2.unroute('**/js/tools.js*');
      await q.click('#invoiceRetry');
      await q.waitForFunction(() => document.getElementById('invVerdict').textContent.includes('اكتب الوزن'), null, { timeout: 8000 });
      ok(true, 'retry loads the invoice check after reconnect');
      ok(await q.locator('#invoiceLoadNote').isHidden(), 'note hides after successful retry');
      await q.close(); await c2.close();
    }
    console.log(checks + ' calc/invoice review assertions passed.');
  } finally { await b.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
