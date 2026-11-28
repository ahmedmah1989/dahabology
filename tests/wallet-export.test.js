// Wallet export: CSV rules + the real click handlers against a small fake DOM (download, share, cancel, failure, race).
const assert = require('assert/strict');
const path = '../public/js/wallet-export.js';
const X = require(path);
const day = '2026-11-28';
const items = [
  { id: 'a1', k: '21', g: 8, paid: 48000, note: 'خاتم', where: 'account', rec: { type: 'jewelry', karat: 21, grams: 8, purchaseDate: '2026-01-15', paid: 48000, making: 2000, tax: 0, stamp: 100, stones: 'without', invoiceId: 'inv-1' } },
  { id: 'd1', k: '24', g: 5, paid: 0, note: '', where: 'device' },
  { id: 'x1', k: '21', g: 1.5, paid: 9000, note: '=HYPERLINK("http://evil")', where: 'device', rec: { type: 'bar', karat: 21, grams: 1.5, purchaseDate: '2025-12-01', paid: 9000 } },
  { id: 'n1', k: '21', g: 2, where: 'device', rec: { type: 'coin', karat: 21, grams: 2 } },
];
const csv = X.buildCsv(items, day), L = csv.split('\r\n');
assert.equal(csv.charCodeAt(0), 0xFEFF);
assert.ok(L[1].includes(',2000,0,100,'), 'fees as saved; zero tax stays 0');
assert.ok(/,0,/.test(L[2]) && L[2].includes('على الجهاز'), 'paid 0 stays 0');
assert.ok(L[3].includes("'=HYPERLINK"), 'formula guard');
assert.deepEqual(L[4].split(',').slice(4, 10), ['', '', '', '', '', ''], 'unrecorded fields are blank, not zero');
assert.ok(csv.includes('غير مسجلة، وليست صفرًا'));
assert.ok(!/token|data:image/i.test(csv));
assert.equal(X.filename(day), 'dahabology-wallet-2026-11-28.csv');
assert.equal(X.cell('a,b'), '"a,b"'); assert.equal(X.cell('say "hi"'), '"say ""hi"""');

// Fake DOM for the click paths. Each run re-requires the module with fresh globals.
function run({ canShare, shareImpl, cloud, local }) {
  delete require.cache[require.resolve(path)];
  const handlers = {}, els = {}, log = { downloads: [], shares: [], revoked: 0, msg: '' };
  const el = id => (els[id] = els[id] || { id, hidden: true, textContent: '', className: '', addEventListener: (t, f) => { handlers[id] = f; } });
  ['walExport', 'walShare', 'walMsg'].forEach(el);
  els.walExport.hidden = false;
  global.document = { getElementById: id => els[id] || null, body: { append: a => log.downloads.push({ name: a.download, href: a.href }) }, createElement: () => ({ click() {}, remove() {} }) };
  global.localStorage = { getItem: () => JSON.stringify(local || []) };
  global.window = { DHB_CLOUD_ITEMS: cloud };
  global.URL.createObjectURL = b => { log.blob = b; return 'blob:fake'; }; global.URL.revokeObjectURL = () => { log.revoked++; };
  Object.defineProperty(global, 'navigator', { configurable: true, writable: true, value: canShare ? { canShare: () => true, share: async d => { log.shares.push(d); if (shareImpl) await shareImpl(); } } : {} });
  require(path);
  return { els, handlers, log, win: global.window };
}
(async () => {
  const dev = [{ id: 'd1', g: 8, paid: 48000, note: 'سبيكة جهاز' }];
  // download: genuine bytes + filename; share button stays hidden without canShare
  let r = run({ canShare: false, cloud: [], local: dev });
  assert.equal(r.els.walShare.hidden, true, 'no share button when the browser cannot share files');
  r.handlers.walExport();
  assert.match(r.log.downloads[0].name, /^dahabology-wallet-\d{4}-\d{2}-\d{2}\.csv$/);
  const txt = Buffer.from(await r.log.blob.arrayBuffer()).toString('utf8');
  assert.ok(txt.charCodeAt(0) === 0xFEFF && txt.includes('سبيكة جهاز') && txt.includes('على الجهاز'));
  // empty wallet: no file
  r = run({ canShare: false, cloud: [], local: [] }); r.handlers.walExport();
  assert.equal(r.log.downloads.length, 0); assert.ok(r.els.walMsg.textContent.includes('مفيش قطع'));
  // account identity changes while the file is built: no file
  r = run({ canShare: false, cloud: [{ id: 'a9', k: '24', g: 2, paid: 13000 }], local: dev });
  URL.createObjectURL = b => { r.win.DHB_CLOUD_ITEMS = []; return 'blob:fake'; };
  r.handlers.walExport(); assert.equal(r.log.downloads.length, 0); assert.ok(r.els.walMsg.textContent.includes('ما نزلش أي ملف'));
  // share: visible only with canShare, runs only on tap, sends one csv File, no upload
  r = run({ canShare: true, cloud: [], local: dev });
  assert.equal(r.els.walShare.hidden, false); assert.equal(r.log.shares.length, 0, 'nothing shared before a tap');
  await r.handlers.walShare();
  assert.equal(r.log.shares.length, 1); const f = r.log.shares[0].files[0];
  assert.match(f.name, /\.csv$/); assert.ok((await f.text()).includes('سبيكة جهاز')); assert.equal(Object.keys(r.log.shares[0]).sort().join(), 'files,title');
  // cancel: silent
  r = run({ canShare: true, cloud: [], local: dev, shareImpl: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } });
  await r.handlers.walShare(); assert.equal(r.els.walMsg.textContent, '');
  // failure: message points to the download button
  r = run({ canShare: true, cloud: [], local: dev, shareImpl: async () => { throw new Error('boom'); } });
  await r.handlers.walShare(); assert.ok(r.els.walMsg.textContent.includes('استخدم زر التنزيل'));
  // empty wallet via share: nothing shared
  r = run({ canShare: true, cloud: [], local: [] }); await r.handlers.walShare(); assert.equal(r.log.shares.length, 0);
  console.log('Wallet export CSV, download, share, cancel, failure and race checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
