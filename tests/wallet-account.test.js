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

test('unpriced account pieces are listed with a readable line, not just counted', () => {
  const w = toWalletItems([{ id: 'p', karat: 21, grams: 5, paid: 100 }, { id: 'u', label: 'سلسلة', karat: 18, grams: 3.5, stones: 'without' }]);
  assert.equal(unpricedLine(w.unpriced[0]), 'سلسلة • عيار 18 • 3.5 جم • بدون سعر شراء'); // the tag is rendered as its own non-wrapping span so it never splits across lines
  assert.equal(unpricedLine({ k: '24', g: 2, note: '' }), 'عيار 24 • 2 جم • بدون سعر شراء');
});
test('the edit form can find a priced or an unpriced account piece, and nothing else', () => {
  const w = toWalletItems([{ id: 'p', karat: 21, grams: 5, paid: 100 }, { id: 'u', karat: 18, grams: 3.5 }]);
  assert.equal(findCloudPiece(w.priced, w.unpriced, 'u').id, 'u'); assert.equal(findCloudPiece(w.priced, w.unpriced, 'p').id, 'p');
  assert.equal(findCloudPiece(w.priced, w.unpriced, 'zz'), undefined); assert.equal(findCloudPiece(null, undefined, 'u'), undefined);
  assert.ok(findCloudPiece(w.priced, w.unpriced, 'u').rec.paid === undefined); // the original record is untouched, price stays unknown
});
test('mixed priced and unpriced: totals count only the priced piece; completing the price adds it exactly', () => {
  const P = { 21: { buy: 5750, sell: 5810 }, 18: { buy: 4900, sell: 4950 }, 24: { buy: 6571, sell: 6660 } };
  const cloud = [{ id: 'p', karat: 21, grams: 5, paid: 30000, stones: 'without' }, { id: 'u', karat: 21, grams: 4.321, stones: 'without' }];
  const w = toWalletItems(cloud), recs = w => w.priced.map(i => i.rec);
  const a = L.aggregate(recs(w), P);
  assert.equal(w.unpriced.length, 1); assert.equal(a.count, 1); assert.equal(a.paidAll, 30000); assert.ok(Math.abs(a.grams - 5) < 1e-9);
  const done = toWalletItems(cloud.map(i => (i.id === 'u' ? Object.assign({}, i, { paid: 27000 }) : i)));
  const b = L.aggregate(recs(done), P);
  assert.equal(done.unpriced.length, 0); assert.equal(b.count, 2); assert.equal(b.paidAll, 57000); assert.ok(Math.abs(b.grams - 9.321) < 1e-9);
});
