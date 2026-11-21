const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../public/js/ledger-model.js');
const P = { 21: { buy: 4640, sell: 4725 }, 18: { buy: 3975, sell: 4050 }, 24: { buy: 5300, sell: 5400 } };
const base = { id: 'a', karat: 21, grams: 6, paid: 19304, making: 600, tax: 84, stamp: 20, stones: 'without' };

test('without stones: gold part and both comparisons', () => {
  assert.equal(L.goldPart(base), 18600);
  const v = L.valuation(base, P);
  assert.equal(v.A.perGram, 3100);
  assert.ok(Math.abs(v.A.percent - (4725 - 3100) / 3100 * 100) < 1e-9);
  assert.ok(Math.abs(v.B.value - 27840) < 1e-9);
});
test('missing fee is unknown, not zero; explicit zero counts', () => {
  const { making, ...noMaking } = base;
  assert.equal(L.goldPart(noMaking), null);
  assert.equal(L.valuation(noMaking, P).whyNoA, 'fees-missing');
  assert.equal(L.valuation(noMaking, P).B.value, 6 * 4640);
  assert.equal(L.goldPart({ ...base, making: 0, tax: 0, stamp: 0 }), 19304);
});
test('stones: A unavailable, never total minus fees; B only with known gold weight', () => {
  const w = { ...base, stones: 'with' };
  assert.equal(L.goldPart(w), null);
  assert.equal(L.valuation(w, P).whyNoA, 'stones-cost-unknown');
  assert.equal(L.netGrams(w), null);
  assert.equal(L.valuation(w, P).B, null);
  assert.equal(L.netGrams({ ...w, basis: 'net' }), 6);
  assert.equal(L.netGrams({ ...w, basis: 'total', stoneG: 0.8 }), 6 - 0.8);
  assert.equal(L.netGrams({ ...w, basis: 'total' }), null);
  assert.equal(L.netGrams({ ...w, basis: 'total', stoneG: 6 }), null);
  assert.equal(L.netGrams({ ...w, basis: 'net', stoneG: 0.8 }), 6, 'net basis never deducts again');
});
test('unset stones (old record) is not treated as without stones', () => {
  const { stones, ...old } = base;
  assert.equal(L.netGrams(old), null);
  assert.equal(L.goldPart(old), null);
  assert.equal(L.valuation(old, P).B, null);
});
test('legacy additions: kept, makes A unavailable, B on paid total still allowed', () => {
  const r = { ...base, additions: 1800 };
  assert.equal(L.goldPart(r), null);
  assert.equal(L.valuation(r, P).whyNoA, 'legacy-additions');
  assert.ok(L.valuation(r, P).B);
  assert.equal(L.goldPart({ ...base, additions: 0 }), 18600, 'zero is not an unexplained component');
});
test('promise is a separate scenario, never in totals', () => {
  const r = { ...base, stones: 'with', promise: 'full' };
  const v = L.valuation(r, P);
  assert.equal(v.promise.guaranteed, false);
  assert.equal(v.promise.value, 6 * 4640);
  const a = L.aggregate([r], P);
  assert.equal(a.covered, 0); assert.equal(a.now, 0); assert.equal(a.diff, null); assert.equal(a.partial, true);
});
test('aggregate: partial coverage with matched cost basis', () => {
  const unset = { id: 'u', karat: 21, grams: 8, paid: 40000 };
  const unpriced = { id: 'n', karat: 24, grams: 10, stones: 'without' };
  const a = L.aggregate([base, unset, unpriced], P);
  assert.equal(a.count, 3); assert.equal(a.covered, 1); assert.equal(a.partial, true);
  assert.equal(a.paidAll, 19304 + 40000); assert.equal(a.paidCovered, 19304);
  assert.equal(a.noGoldWeight, 1); assert.equal(a.unpriced, 1);
  assert.ok(Math.abs(a.diff - (27840 - 19304)) < 1e-9);
  const full = L.aggregate([base], P); assert.equal(full.partial, false);
  assert.equal(L.aggregate([], P).diff, null);
});
test('editItem preserves unknown/legacy fields and other items; change applies', () => {
  const items = [{ id: 'x', karat: 21, grams: 5, paid: 100, label: 'k', futureField: 'keep', additions: 7 }, { id: 'y', karat: 18, grams: 3, paid: 50 }];
  const r = L.editItem(items, 'x', { grams: '5', paid: '120', stones: 'with', basis: 'total', stoneG: '0.5', promise: 'full', making: '', tax: '0' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.items[1], items[1]);
  const e = r.items[0];
  assert.equal(e.futureField, 'keep'); assert.equal(e.additions, 7); assert.equal(e.label, 'k');
  assert.equal(e.paid, 120); assert.equal(e.stones, 'with'); assert.equal(e.stoneG, 0.5); assert.equal(e.tax, 0); assert.equal('making' in e, false);
  assert.equal(items[0].paid, 100, 'input not mutated');
});
test('editItem: invalid input returns the original unchanged', () => {
  const items = [{ id: 'x', karat: 21, grams: 5, paid: 100, stones: 'with', basis: 'net' }];
  for (const f of [{ grams: '0' }, { grams: 'abc' }, { grams: '5', paid: '-1' }, { grams: '5', stones: 'maybe' }, { grams: '5', stones: 'with', basis: 'total', stoneG: '5' }, { grams: '5', stones: 'with', basis: 'total', stoneG: '0' }, { grams: '5', making: 'x' }]) {
    const r = L.editItem(items, 'x', f); assert.equal(r.ok, false, JSON.stringify(f)); assert.equal(r.items, items);
  }
  assert.equal(L.editItem(items, 'nope', { grams: '5' }).ok, false);
});
test('editItem: details of a piece switched to without stones are cleared, not carried', () => {
  const items = [{ id: 'x', karat: 21, grams: 5, paid: 100, stones: 'with', basis: 'total', stoneG: 0.5, promise: 'full' }];
  const e = L.editItem(items, 'x', { grams: '5', paid: '100', stones: 'without', basis: 'total', stoneG: '0.5', promise: 'full' }).items[0];
  assert.equal(e.stones, 'without'); assert.equal('basis' in e, false); assert.equal('stoneG' in e, false); assert.equal('promise' in e, false);
});
test('editing an old record without choosing stones leaves it unset', () => {
  const items = [{ id: 'o', karat: 21, grams: 8 }];
  const e = L.editItem(items, 'o', { grams: '8', stones: '' }).items[0];
  assert.equal('stones' in e, false); assert.equal('paid' in e, false);
});
test('deleteItem removes one record only', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(L.deleteItem(items, 'b').map(x => x.id), ['a', 'c']);
  assert.equal(items.length, 3);
});
test('arabic-indic digits are accepted in optional fields', () => {
  assert.equal(L.readDetails({ stones: 'without', making: '٦٠٠', tax: '٠', stamp: '٢٠' }).details.making, 600);
});

// ---- optimistic commit (in-memory fake store: MOCK, not Firestore) ----
let commitWithRetry; test('load commit helper', async () => { ({ commitWithRetry } = await import('../public/js/account.js')); });
function fakeStore(items) {
  const s = { doc: { v: 1, items }, ver: 1, saves: 0 };
  s.load = async () => ({ data: JSON.parse(JSON.stringify(s.doc)), version: s.ver });
  s.save = async (data, version) => { if (version !== s.ver) { const e = new Error('c'); e.code = 'CONFLICT'; throw e; } s.doc = data; s.ver++; s.saves++; };
  s.other = fn => { s.doc = { v: 1, items: fn(s.doc.items) }; s.ver++; };
  return s;
}
test('commit: stale copy is retried on newer rows, other tab work survives', async () => {
  const s = fakeStore([{ id: 'x', grams: 5 }, { id: 'y', grams: 3 }]);
  let first = true;
  await commitWithRetry({ load: async () => { const r = await s.load(); if (first) { first = false; s.other(it => it.filter(i => i.id !== 'y').concat({ id: 'w', grams: 7 })); } return r; }, save: s.save, mutate: it => L.editItem(it, 'x', { grams: '6' }) });
  assert.deepEqual(s.doc.items.map(i => i.id + ':' + i.grams), ['x:6', 'w:7']);
});
test('commit: exhausted attempts save nothing and throw CONFLICT', async () => {
  const s = fakeStore([{ id: 'x', grams: 5 }]);
  await assert.rejects(commitWithRetry({ attempts: 3, load: async () => { const r = await s.load(); s.other(it => it.concat({ id: 'n' + s.ver, grams: 1 })); return r; }, save: s.save, mutate: it => ({ items: it.filter(i => i.id !== 'x') }) }), e => e.code === 'CONFLICT' && !!e.ar);
  assert.equal(s.saves, 0);
  assert.ok(s.doc.items.some(i => i.id === 'x'));
});
test('commit: non-conflict errors are not retried; mutate with nothing to write skips save', async () => {
  const s = fakeStore([{ id: 'x' }]); let calls = 0;
  await assert.rejects(commitWithRetry({ load: s.load, save: async () => { calls++; throw Object.assign(new Error('net'), { code: 'NETWORK' }); }, mutate: it => ({ items: it }) }), e => e.code === 'NETWORK');
  assert.equal(calls, 1);
  const r = await commitWithRetry({ load: s.load, save: async () => { throw new Error('should not save'); }, mutate: () => ({ added: false }) });
  assert.equal(r.added, false);
});

test('sameRow: detects any change to a row, ignores key order', () => {
  assert.equal(L.sameRow({ id: 'a', grams: 8, stones: 'with' }, { stones: 'with', grams: 8, id: 'a' }), true);
  assert.equal(L.sameRow({ id: 'a', grams: 8 }, { id: 'a', grams: 9 }), false);
  assert.equal(L.sameRow({ id: 'a', grams: 8 }, { id: 'a', grams: 8, stones: 'without' }), false);
  assert.equal(L.sameRow({ id: 'a', grams: 8, x: undefined }, { id: 'a', grams: 8 }), true);
  assert.equal(L.sameRow(null, { id: 'a' }), false);
});

test('grams: one weight field reads 3.125 as 3 g 125 mg in every spelling, never loses a milligram', () => {
  for (const s of ['3.125', '3,125', '٣.١٢٥', '٣٫١٢٥', '٣،١٢٥', '۳٫۱۲۵', ' 3.125 ']) assert.equal(L.parseNumber(s, 'grams').value, 3.125, s);
  assert.equal(L.parseNumber('0.001', 'grams').value, 0.001);
  assert.equal(L.parseNumber('3.1255', 'grams').error, 'precision');
  assert.equal(L.parseNumber('٣٫١٢٥٥', 'grams').error, 'precision');
});
test('numbers: letters, exponent, hex, inner spaces, bad separators and negatives are errors, blank is blank', () => {
  for (const s of ['0x10', '1e2', '3.125 g', '٣ ١٢٥', '3..1', '5.', '-3', 'abc', '.', ',']) assert.ok(L.parseNumber(s, 'grams').error, s);
  assert.equal(L.parseNumber('', 'grams').blank, true);
  assert.equal(L.parseNumber('   ', 'money').blank, true);
});
test('money: 46,000 is 46000 (not 46), decimals stay, 46.000 is refused as unclear', () => {
  assert.equal(L.parseNumber('٤٦,٠٠٠', 'money').value, 46000);
  assert.equal(L.parseNumber('46,000', 'money').value, 46000);
  assert.equal(L.parseNumber('1,234,567', 'money').value, 1234567);
  assert.equal(L.parseNumber('46,5', 'money').value, 46.5);
  assert.equal(L.parseNumber('1,234.50', 'money').value, 1234.5);
  assert.equal(L.parseNumber('46.000', 'money').error, 'ambiguous');
  assert.ok(L.parseNumber('12,34,567', 'money').error);
});
test('edit keeps milligrams end to end and refuses sub-milligram or unclear weight', () => {
  const list = [{ id: 'x', karat: 21, grams: 3.125, paid: 19304, purchaseDate: '2025-01-02', legacyKey: 'keep' }];
  const ok = L.editItem(list, 'x', { grams: '٣٫١٢٥', paid: '١٩٬٣٠٤', stones: 'without' });
  assert.equal(ok.ok, true); assert.equal(ok.items[0].grams, 3.125); assert.equal(ok.items[0].paid, 19304); assert.equal(ok.items[0].legacyKey, 'keep');
  assert.equal(JSON.parse(JSON.stringify(ok.items))[0].grams, 3.125);
  for (const g of ['3.1255', '3 g', '0', '1e1']) { const r = L.editItem(list, 'x', { grams: g, paid: '19304' }); assert.equal(r.ok, false, g); assert.equal(r.items, list); }
  const r2 = L.editItem(list, 'x', { grams: '10', paid: '1', stones: 'with', basis: 'total', stoneG: '0.0005' });
  assert.equal(r2.ok, false);
});
test('totals add milligram weights without float drift', () => {
  const recs = [0.1, 0.2, 3.125, 0.001].map((g, i) => ({ id: String(i), karat: 21, grams: g }));
  assert.equal(L.aggregate(recs, {}).grams, 3.426);
  assert.equal(L.aggregate([{ id: 'a', karat: 21, grams: 0.1 }, { id: 'b', karat: 21, grams: 0.2 }], {}).grams, 0.3);
});

test('account preview page loads the strict parser before its script, wallet page keeps legacy precise grams on unchanged edit', () => {
  const fs = require('node:fs');
  const a = fs.readFileSync(require('node:path').join(__dirname, '../src/pages/account-preview.astro'), 'utf8');
  const i = a.indexOf('/js/ledger-model.js'), j = a.indexOf('/js/account-ui.js');
  assert.ok(i > 0 && j > i);
  const u = fs.readFileSync(require('node:path').join(__dirname, '../public/js/account-ui.js'), 'utf8');
  assert.ok(!/Number\(String\(\$\("iGrams"\)/.test(u));
  assert.ok(/parseNumber/.test(u));
});
