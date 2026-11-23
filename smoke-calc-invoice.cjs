/* Quick stage-2 smoke: merged calculator/invoice tabs behavior, redirect, lazy tools.js,
   offline failure note + retry. Formal review-calc-invoice.cjs suite comes next. */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'); let checks = 0; const ok = (x, m) => { assert.ok(x, m); checks++ };
const root = path.join(__dirname, 'dist'), out = '/downloads/dahab-tabs';
const server = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0])); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  try {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await c.route('https://**/*', r => r.abort());
    const p = await c.newPage();
    p.on('pageerror', e => { throw new Error('pageerror: ' + e.message); });
    await p.goto(base + '/calculator/');
    ok(await p.locator('#tab-calculator').getAttribute('aria-selected') === 'true', 'calculator tab default');
    ok(await p.locator('#pane-calculator').isVisible(), 'calc pane visible');
    ok(!await p.locator('#pane-invoice').isVisible(), 'invoice pane hidden at load');
    ok(!await p.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('tools.js'))), 'tools.js NOT loaded for plain calculator visit');
    ok((await p.locator('.x-top h1').textContent()).trim() === 'الحاسبة', 'h1 calculator');
    await p.fill('#cAmount', '100000');
    await p.click('#tab-invoice');
    ok(await p.locator('#pane-invoice').isVisible(), 'invoice pane opens');
    ok((await p.locator('.x-top h1').textContent()).trim() === 'افحص الفاتورة', 'h1 switches to invoice');
    ok((await p.title()).includes('فاتورة'), 'title switches to invoice');
    ok(await p.url().includes('#invoice'), 'hash follows tab');
    await p.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.includes('tools.js')), null, { timeout: 5000 });
    ok(true, 'tools.js lazy-loaded on first invoice activation');
    ok((await p.locator('#invVerdict').textContent()).includes('اكتب الوزن'), 'invoice verdict placeholder renders (lazy bundle live)');
    await p.fill('#invGrams', '8'); await p.fill('#invTotal', '49500');
    ok(await p.locator('#invDonut').isVisible(), 'invoice donut visible after input');
    await p.click('#tab-calculator');
    ok((await p.locator('#cAmount').inputValue()) === '100000', 'calculator input survives tab round trip');
    ok((await p.locator('.x-top h1').textContent()).trim() === 'الحاسبة', 'h1 restored');

    const p2 = await c.newPage();
    await p2.goto(base + '/calculator/#invoice');
    await p2.waitForSelector('#pane-invoice:not([hidden])');
    ok(true, 'deep link /calculator/#invoice opens invoice pane at load');

    const p3 = await c.newPage();
    await p3.goto(base + '/invoice/');
    await p3.waitForURL(u => u.pathname.endsWith('/calculator/') && u.hash === '#invoice', { timeout: 5000 });
    await p3.waitForSelector('#pane-invoice:not([hidden])');
    ok(true, '/invoice/ redirects to the invoice tab');

    /* blocked tools.js: honest connection-needed note + retry */
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
    await q.screenshot({ path: out + '/invoice-offline-note-390.png' });
    await c2.unroute('**/js/tools.js*');
    await q.click('#invoiceRetry');
    await q.waitForFunction(() => document.getElementById('invVerdict').textContent.includes('اكتب الوزن'), null, { timeout: 8000 });
    ok(true, 'retry loads the invoice check after reconnect');
    ok(await q.locator('#invoiceLoadNote').isHidden(), 'note hides after successful retry');
    console.log(checks + ' calc/invoice smoke checks passed.');
    await c.close(); await c2.close();
  } finally { await b.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
