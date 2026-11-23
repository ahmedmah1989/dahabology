const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict');
const root = path.join(__dirname, 'dist'), out = '/downloads/dahab-tabs';
const server = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.setHeader('content-type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' })[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  try {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await c.newPage();
    await p.goto(base + '/market/');
    await p.waitForFunction(() => { const t = document.getElementById('heroPrice').textContent.trim(); return t !== '—' && t !== ''; }, null, { timeout: 15000 });
    const hero = await p.locator('#heroPrice').textContent();
    const heroTime = await p.locator('#heroTime').textContent();
    assert.ok(/\d/.test(hero), 'market hero price is numeric with live data');
    assert.ok(heroTime.trim().length > 0, 'market price keeps its source time');
    await p.screenshot({ path: out + '/live-data-market.png' });

    await p.click('#tab-analysis');
    await p.waitForFunction(() => { const t = document.getElementById('analysisNow').textContent.trim(); return t !== '—'; }, null, { timeout: 20000 });
    const now = await p.locator('#analysisNow').textContent();
    const fx = await p.locator('#analysisFxBasis').textContent();
    assert.ok(/\d/.test(now), 'analysis today reading numeric with live data');
    assert.ok(fx.includes('المركزي'), 'analysis keeps CBE dated FX basis wording');
    await p.waitForTimeout(1500);
    await p.screenshot({ path: out + '/live-data-analysis.png' });

    await p.click('#tab-live');
    await p.waitForFunction(() => document.getElementById('nativeChart').children.length > 0, null, { timeout: 15000 });
    const status = await p.locator('#liveChartStatus').textContent();
    assert.ok(/قراءة/.test(status), 'live chart drew at least one session reading with live data');
    await p.screenshot({ path: out + '/live-data-live.png' });

    await p.click('#tab-market');
    assert.ok(/\d/.test(await p.locator('#heroPrice').textContent()), 'market numbers intact after round trip');
    console.log('LIVE DATA OK | hero=' + hero.trim() + ' | analysisNow=' + now.trim() + ' | live: ' + status.trim().slice(0, 60));
    await c.close();
  } finally { await b.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
