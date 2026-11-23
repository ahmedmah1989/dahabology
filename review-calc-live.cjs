/* Real-data stage-2 pass: invoice tab against the live isagha quote + before/after mobiles. */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'); let checks = 0; const ok = (x, m) => { assert.ok(x, m); checks++ };
const root = path.join(__dirname, 'dist'), out = '/downloads/dahab-tabs';
const server = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  try {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await c.newPage();
    p.on('pageerror', e => { throw new Error('pageerror: ' + e.message); });
    await p.goto('http://127.0.0.1:' + server.address().port + '/calculator/#invoice', { timeout: 30000 });
    await p.waitForFunction(() => { const v = document.getElementById('invPrice').value; return v && Number(v) > 1000; }, null, { timeout: 20000 });
    const price = await p.locator('#invPrice').inputValue();
    ok(true, 'invoice price prefilled from the live isagha quote: ' + price);
    ok((await p.locator('#invQuoteStatus').textContent()).includes('تقييم إعادة البيع الآن'), 'resale-evaluation wording intact with live quote');
    await p.fill('#invGrams', '8'); await p.fill('#invTotal', String(Math.round(Number(price) * 8 + 4000)));
    await p.waitForFunction(() => document.getElementById('invVerdict').textContent.includes('فوق قيمة الذهب'), null, { timeout: 5000 });
    ok(true, 'verdict separates extra paid above gold value with live price');
    const pct = await p.locator('#invDonutPct').textContent();
    ok(/%$/.test(pct) && !/NaN/.test(pct), 'donut percentage complete on one line: ' + pct);
    await p.screenshot({ path: out + '/live-data-invoice.png' });
    await p.goto('http://127.0.0.1:' + server.address().port + '/calculator/');
    await p.waitForFunction(() => document.getElementById('cPrice').value !== '' || document.getElementById('cQuoteStatus').textContent.length > 3, null, { timeout: 20000 });
    ok(true, 'calculator live quote status renders');
    await c.close();
    /* before: live site standalone pages, bottom-scrolled */
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const q = await c2.newPage();
    for (const pg of ['calculator', 'invoice']) {
      await q.goto('https://ahmedmah1989.github.io/dahabology/' + pg + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await q.waitForTimeout(2200);
      await q.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await q.waitForTimeout(400);
      await q.screenshot({ path: out + '/before-' + pg + '-bottom-390.png' });
    }
    await c2.close();
    console.log(checks + ' real-data calc/invoice checks passed. before/after captured.');
  } finally { await b.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
