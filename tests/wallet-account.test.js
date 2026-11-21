const test = require('node:test'), assert = require('node:assert');
const { buildRecord, mergeItem, removeItem, toWalletItems, num } = require('../public/js/wallet-account.js');
const local = { id: 'a1', k: '21', g: 8, paid: 49500, note: 'جنيه' };
test('record uses the gold/items schema and keeps the price paid', () => {
  const r = buildRecord(local, { type: 'coin', date: '2025-03-01' });
  assert.deepEqual(r.rec, { id: 'a1', label: 'جنيه', type: 'coin', karat: 21, grams: 8, purchaseDate: '2025-03-01', paid: 49500 });
});
test('jewelry needs a purpose, others carry none', () => {
  assert.ok(buildRecord(local, { type: 'jewelry', date: '2025-03-01' }).error);
  assert.equal(buildRecord(local, { type: 'jewelry', date: '2025-03-01', purpose: 'saving' }).rec.purpose, 'saving');
  assert.equal('purpose' in buildRecord(local, { type: 'bar', date: '2025-03-01', purpose: 'saving' }).rec, false);
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
