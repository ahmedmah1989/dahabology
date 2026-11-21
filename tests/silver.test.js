const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../public/js/silver-view.js');
const now = Date.parse('2026-11-21T15:00:00Z'), iso = ms => new Date(now - ms).toISOString();
test('global silver accepts only a recent USD XAG quote', () => {
  const g = S.globalSilver({ symbol: 'XAG', currency: 'USD', price: 41.08, updatedAt: iso(5000) }, now);
  assert.ok(Math.abs(g.gramUSD - 41.08 / 31.1034768) < 1e-9); assert.equal(g.ozUSD, 41.08);
  for (const b of [null, { symbol: 'XAU', price: 41, updatedAt: iso(0) }, { symbol: 'XAG', currency: 'EUR', price: 41, updatedAt: iso(0) }, { symbol: 'XAG', price: 0, updatedAt: iso(0) }, { symbol: 'XAG', price: 41, updatedAt: iso(86400001) }, { symbol: 'XAG', price: 41, updatedAt: '2026-11-21T14:59:00' }, { symbol: 'XAG', price: 41, updatedAt: new Date(now + 600000).toISOString() }])
    assert.equal(S.globalSilver(b, now), null);
});
test('local silver needs a valid recent file entry and never derives from global', () => {
  const q = { status: 'available', sourceTime: iso(1000), grades: { 999: { buy: 70.75, sell: 73.75 }, 925: { buy: 65.5, sell: 68.5 }, 800: { buy: 0, sell: 59 } } };
  const r = S.localSilver(q, now); assert.deepEqual(r.rows.map(x => x.grade), ['999', '925']);
  assert.equal(S.localSilver({ ...q, sourceTime: iso(86400001) }, now), null);
  assert.equal(S.localSilver({ ...q, status: 'unavailable' }, now), null);
  assert.equal(S.localSilver(undefined, now), null);
  assert.equal(S.localSilver({ status: 'available', sourceTime: iso(0) }, now), null);
});
test('catalog sizes: bars 24k, coins 21k, others ignored', () => {
  const L = require('../public/js/ledger-model.js');
  const z = L.sizesFromCatalog([{ kind: 'bars', weight: 5, karat: 24 }, { kind: 'bars', weight: 1, karat: 24 }, { kind: 'bars', weight: 250, karat: 22 }, { kind: 'bars', weight: 'x', karat: 24 }, { kind: 'pound', weight: 8, karat: 21, name: 'جنيه' }, { kind: 'ounce', weight: 31.1, karat: 24 }]);
  assert.deepEqual(z.bars, [1, 5]); assert.deepEqual(z.coins, [{ w: 8, name: 'جنيه' }]);
  assert.equal(L.sizesFromCatalog([]), null); assert.equal(L.sizesFromCatalog(null), null);
  assert.equal(L.BAR_PRESETS, undefined);
});
