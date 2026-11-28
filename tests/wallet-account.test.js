const test = require('node:test'), assert = require('node:assert');
const { buildRecord, mergeItem, removeItem, toWalletItems, unpricedLine, findCloudPiece, num } = require('../public/js/wallet-account.js');
const L = require('../public/js/ledger-model.js');
const local = { id: 'a1', k: '21', g: 8, paid: 49500, note: 'جنيه' };
test('record uses the gold/items schema and keeps the price paid', () => {
  const r = buildRecord(local, { type: 'coin', date: '2025-03-01' });
  assert.deepEqual(r.rec, { id: 'a1', label: 'جنيه', type: 'coin', karat: 21, grams: 8, purchaseDate: '2025-03-01', paid: 49500 });
});
test('explicit purpose is stored across types; legacy unknowns stay unknown', () => {
  assert.ok(buildRecord(local, { type: 'jewelry', date: '2025-03-01' }).error);
  assert.equal(buildRecord(local, { type: 'jewelry', date: '2025-03-01', purpose: 'saving' }).rec.purpose, 'saving');
  assert.equal(buildRecord(local, { type: 'bar', date: '2025-03-01', purpose: 'saving' }).rec.purpose, 'saving');
  assert.equal('purpose' in buildRecord(local, { type: 'scrap', date: '2025-03-01' }).rec, false);
  assert.equal(buildRecord(local, { type: 'scrap', date: '2025-03-01', purpose: 'adornment' }).rec.purpose,'adornment');
});
test('bad input is refused: type, date, weight, price', () => {
  assert.ok(buildRecord(local, { type: '', date: '2025-03-01' }).error);
  assert.ok(buildRecord(local, { type: 'bar', date: '' }).error);
  assert.ok(buildRecord(local, { type: 'bar', date: '2025-13-45' }).error);
  assert.ok(buildRecord({ ...local, g: NaN }, { type: 'bar', date: '2025-03-01' }).error);
  assert.ok(buildRecord({ ...local, paid: -1 }, { type: 'bar', date: '2025-03-01' }).error);
  assert.ok(buildRecord({ ...local, paid: NaN }, { type: 'bar', date: '2025-03-01' }).error);
  assert.ok(buildRecord({ ...local, k: '22' }, { type: 'bar', date: '2025-03-01' }).error);
  assert.ok(buildRecord(null, { type: 'bar', date: '2025-03-01' }).error);
});
test('merge keeps every existing item, never duplicates an id', () => {
  const ex = [{ id: 'x', grams: 1 }, { id: 'a1', grams: 9 }];
  const rec = buildRecord(local, { type: 'bar', date: '2025-03-01' }).rec;
  const dup = mergeItem(ex, rec); assert.equal(dup.added, false); assert.deepEqual(dup.items, ex);
  const fresh = mergeItem([{ id: 'x' }], rec); assert.equal(fresh.added, true); assert.equal(fresh.items.length, 2);
  assert.equal(mergeItem(null, rec).items.length, 1);
});
test('remove deletes only that id', () => {
  assert.deepEqual(removeItem([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
  assert.deepEqual(removeItem(null, 'a'), []);
});
test('account items map to wallet items; items with no price paid are never valued as zero', () => {
  const w = toWalletItems([{ id: '1', label: 'x', type: 'bar', karat: 21, grams: 5, purchaseDate: '2025-01-01', paid: 100 }, { id: '2', type: 'bar', karat: 24, grams: 2, purchaseDate: '2025-01-01' }, { id: '3', karat: 22, grams: 1 }, null]);
  assert.deepEqual(w.priced, [{ id: '1', k: '21', g: 5, paid: 100, note: 'x', rec: w.priced[0].rec }]);
  assert.equal(w.unpriced.length, 1); assert.equal(w.unpriced[0].id, '2');
});
test('numbers accept Arabic digits and a comma', () => { assert.equal(num('٤٩٥٠٠'), 49500); assert.equal(num('8,5'), 8.5); assert.ok(Number.isNaN(num(''))) ; });

test('unpriced account pieces stay in the one list, with price paid unknown and the record untouched', () => {
  const cloud = [{ id: 'p', karat: 21, grams: 5, paid: 100 }, { id: 'u', label: 'سلسلة', karat: 18, grams: 3.5, stones: 'without' }, { id: 'z', karat: 24, grams: 1, paid: 0 }];
  const w = toWalletItems(cloud);
  assert.deepEqual(w.all.map(x => x.id), ['p', 'u', 'z'], 'original order, nothing dropped');
  assert.equal(w.unpriced.length, 1); assert.equal(w.all[1].paid, undefined); assert.equal(w.all[1].rec, cloud[1]);
  assert.equal(w.all[2].paid, 0, 'an explicit zero paid is a recorded price, not unknown');
});
test('mixed priced and unpriced: market value includes both, paid and gain/loss only the priced; completing the price changes only those', () => {
  const P = { 21: { buy: 5750, sell: 5810 }, 18: { buy: 4900, sell: 4950 }, 24: { buy: 6571, sell: 6660 } };
  const cloud = [{ id: 'p', karat: 21, grams: 5, paid: 30000, stones: 'without' }, { id: 'u', karat: 21, grams: 4.321, stones: 'without' }];
  const recs = w => w.all.map(i => i.rec);
  const a = L.aggregate(recs(toWalletItems(cloud)), P);
  assert.equal(a.count, 2); assert.equal(a.valued, 2); assert.equal(a.unpriced, 1); assert.equal(a.paidAll, 30000);
  assert.ok(Math.abs(a.now - (5 + 4.321) * 5750) < 1e-6); assert.ok(Math.abs(a.grams - 9.321) < 1e-9);
  assert.equal(a.covered, 1); assert.ok(Math.abs(a.diff - (5 * 5750 - 30000)) < 1e-6, 'gain/loss only on the matched piece');
  const b = L.aggregate(recs(toWalletItems(cloud.map(i => (i.id === 'u' ? Object.assign({}, i, { paid: 27000 }) : i)))), P);
  assert.equal(b.unpriced, 0); assert.equal(b.paidAll, 57000); assert.equal(b.covered, 2); assert.ok(Math.abs(b.now - a.now) < 1e-9, 'market value does not change when a price is added');
});
