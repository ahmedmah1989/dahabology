/* Entry-fold verification (2026-11-23): after the screen merges, the home orbs and the dock's
   المزيد sheet must show one entry per actual screen - السوق (with التحليل/الرسم الحي named under
   it) and الحاسبة (with فحص الفاتورة named under it) - with every old address still working.
   Also pins the accessibility contract of the short-viewport reorder: the buy/spread chips and
   price circle are not focusable, so keyboard/screen-reader order must be identical with and
   without the reorder (DOM order never changed). */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'); let checks = 0; const ok = (x, m) => { assert.ok(x, m); checks++ };
const root = path.join(__dirname, 'dist'), out = '/downloads/dahab-tabs'; fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0])); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' })[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  try {
    for (const width of [320, 390]) {
      const c = await b.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await c.route('https://**/*', r => r.abort());
      const p = await c.newPage();
      await p.goto(base + '/');
      const orbs = await p.evaluate(() => [...document.querySelectorAll('.orb')].map(o => ({
        label: o.querySelector('.lbl').textContent.trim(),
        href: o.getAttribute('href')
      })));
      ok(orbs.length === 7, 'home shows 7 orbs after the fold (' + width + 'px): ' + orbs.map(o => o.label).join('|'));
      ok(!orbs.some(o => ['افحص الفاتورة', 'الفاتورة', 'التحليل', 'الرسم الحي'].includes(o.label)), 'no merged-screen orb remains (' + width + 'px)');
      ok(orbs.some(o => o.label === 'السوق') && orbs.some(o => o.label === 'الحاسبة'), 'parent orbs present (' + width + 'px)');
      /* merged features are explained by a legend line that stays readable at small widths
         (reviewer: 6.8px in-orb sub-labels at 320px were too tiny to explain the merge) */
      const legend = await p.evaluate(() => { const l = document.querySelector('.home-legend'); if (!l) return null; const r = l.getBoundingClientRect(); return { text: l.textContent, size: parseFloat(getComputedStyle(l).fontSize), fits: r.width <= innerWidth + 1, visible: r.height > 0 }; });
      ok(legend && /التحليل/.test(legend.text) && /الرسم الحي/.test(legend.text) && /فحص الفاتورة/.test(legend.text), 'legend names all merged features (' + width + 'px)');
      ok(legend.size >= 13, 'legend font is readable at ' + width + 'px: ' + legend.size + 'px');
      ok(legend.fits && legend.visible, 'legend within viewport width (' + width + 'px)');
      ok(orbs.every(o => !/#/.test(o.href)), 'orb hrefs go to screen roots, old hash deep links not needed (' + width + 'px)');
      ok(orbs.some(o => o.label === 'حسابي') && orbs.some(o => o.label === 'دهبي'), 'حسابي and دهبي orbs intact and separate (' + width + 'px)');
      const fit = await p.evaluate(() => [...document.querySelectorAll('.orb')].every(o => o.querySelector('.lbl').scrollWidth <= o.clientWidth * 1.06));
      ok(fit, 'orb labels fit the circle (' + width + 'px)');
      if (width === 390) await p.screenshot({ path: out + '/fold-home-orbs-390.png' });

      /* dock: visible 5 unchanged, المزيد sheet folded */
      await p.goto(base + '/market/');
      const dock = await p.evaluate(() => [...document.querySelectorAll('.x-dock a, .x-dock button')].map(a => (a.textContent || '').trim()));
      ['الفاتورة', 'التحليل', 'الرسم الحي'].forEach(l => ok(!dock.includes(l), 'المزيد sheet no longer lists ' + l + ' (' + width + 'px)'));
      ['المنتجات', 'الدليل', 'حكايتنا', 'المساعد الذكي', 'السوق', 'الحاسبة', 'دهبي'].forEach(l => ok(dock.some(d => d.includes(l)), 'dock keeps ' + l + ' (' + width + 'px)'));
      await c.close();
    }

    /* old entry points still land correctly (backward compatibility) */
    {
      const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await c.route('https://**/*', r => r.abort());
      const p = await c.newPage();
      for (const [url, pane] of [['/invoice/', 'pane-invoice'], ['/analysis/', 'pane-analysis'], ['/live/', 'pane-live']]) {
        await p.goto(base + url);
        await p.waitForSelector('.market-tabs');
        ok(await p.locator('#' + pane).isVisible(), url + ' still opens its merged pane');
      }
      await c.close();
    }

    /* a11y: short-viewport reorder changes no focus order - focusable sequence identical at 844 and 667 */
    {
      const seq = async h => {
        const c = await b.newContext({ viewport: { width: 375, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
        await c.route('https://**/*', r => r.abort());
        const p = await c.newPage();
        await p.goto(base + '/market/');
        await p.waitForSelector('.market-tabs');
        const ids = [];
        for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); ids.push(await p.evaluate(() => { const e = document.activeElement; return (e.id || e.textContent || '').trim().slice(0, 18); })); }
        await c.close();
        return ids;
      };
      const tall = await seq(844), short = await seq(667);
      assert.deepEqual(short, tall, 'Tab order identical at 667px (reordered visuals) and 844px'); checks++;
      ok(!tall.some(t => /التاجر يشتري|فرق البيع/.test(t)), 'non-interactive chips never enter the tab order');
      /* visual order of the reordered row: chips above circle only at short height */
      const c = await b.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await c.route('https://**/*', r => r.abort());
      const p = await c.newPage();
      await p.goto(base + '/market/');
      const order = await p.evaluate(() => { const pair = document.querySelector('.x-pair').getBoundingClientRect(), hero = document.querySelector('.x-hero').getBoundingClientRect(), kar = document.querySelector('.x-karats').getBoundingClientRect(); return { karB: kar.bottom, pairT: pair.top, pairB: pair.bottom, heroT: hero.top, domBefore: document.querySelector('.x-hero').compareDocumentPosition(document.querySelector('.x-pair')) & Node.DOCUMENT_POSITION_FOLLOWING }; });
      ok(order.karB <= order.pairT + 1 && order.pairB <= order.heroT + 1, 'short height visual order: karats, chips, circle');
      ok(order.domBefore, 'DOM order unchanged (hero still before chips for screen readers)');
      await p.screenshot({ path: out + '/fold-market-375x667.png' });
      await c.close();
    }
    console.log(checks + ' entry-fold/a11y assertions passed.');
  } finally { await b.close(); server.close(); }
})();
