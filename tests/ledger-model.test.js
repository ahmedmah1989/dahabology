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

// ---- invoices, quantity, weight (synthetic values only) ----
const { test: t2 } = require('node:test');
const assert2 = require('node:assert/strict');
const LM = require('../public/js/ledger-model.js');
t2('weight parts compose to integer milligrams, leading zeros kept', () => {
  assert2.equal(LM.composeWeight('6', '28').mg, 6280);
  assert2.equal(LM.composeWeight('6', '028').mg, 6028);
  assert2.equal(LM.composeWeight('', '5').mg, 500);
  assert2.equal(LM.composeWeight('10', '').mg, 10000);
  assert2.equal(LM.composeWeight('٦', '٢٨').mg, 6280);
  assert2.ok(LM.composeWeight('', '').blank);
  assert2.ok(LM.composeWeight('1', '2345').error);
  assert2.ok(LM.composeWeight('1a', '2').error);
  assert2.ok(LM.composeWeight('0', '0').error);
});
t2('quantity is a whole number 1..999 and blank means 1', () => {
  assert2.equal(LM.readQty('').value, 1); assert2.equal(LM.readQty('3').value, 3); assert2.equal(LM.readQty('999').value, 999);
  ['0', '1000', '2.5', '-1', 'x', '2,5'].forEach(v => assert2.ok(LM.readQty(v).error, v));
});
t2('quantity times unit weight is exact in milligrams', () => {
  assert2.equal(LM.gramsOfMg(LM.totalMg(10000, 3)), 30);
  assert2.equal(LM.gramsOfMg(LM.totalMg(6028, 7)), 42.196);
  assert2.equal(LM.gramsOfMg(LM.totalMg(2500, 3)), 7.5);
});
t2('invoice figures: third value is calculated in piastres; mismatch is flagged, never changed', () => {
  const a = LM.invoiceFigures('has', 175438.6, 24561.4, undefined); assert2.equal(a.total, 20000000); assert2.equal(a.calc, 'total');
  const b = LM.invoiceFigures('has', 175438.6, undefined, 200000); assert2.equal(b.vat, 2456140); assert2.equal(b.calc, 'vat');
  const c = LM.invoiceFigures('has', undefined, 24561.4, 200000); assert2.equal(c.sub, 17543860); assert2.equal(c.calc, 'sub');
  const d = LM.invoiceFigures('has', 100, 14, 115); assert2.equal(d.mismatch, true); assert2.equal(d.calc, null); assert2.equal(d.vat, 1400);
  assert2.equal(LM.invoiceFigures('has', 0.1, 0.2, undefined).total, 30);
  assert2.equal(LM.invoiceFigures('has', 100, 200, undefined).calc, 'total');
  assert2.equal(LM.invoiceFigures('has', 500, undefined, 100).negative, true);
  assert2.equal(LM.invoiceFigures('none').calc, null);
});
t2('reconcile compares once, shows the difference, never splits it', () => {
  assert2.deepEqual(LM.reconcile(200000, [{ paid: 149500 }, { paid: 50500 }]), { state: 'match', diff: 0 });
  assert2.deepEqual(LM.reconcile(200000, [{ paid: 149500 }, { paid: 50400.5 }]), { state: 'diff', diff: 99.5 });
  assert2.equal(LM.reconcile(200000, [{ paid: 1 }, {}]).state, 'incomplete');
  assert2.equal(LM.reconcile(undefined, [{ paid: 1 }]).state, 'no-total');
});
const baseInv = { id: 'inv1', date: '2026-11-12', mode: 'has', sub: '175438.60', vat: '24561.40', total: '' };
const barLine = { id: 'r1', type: 'bar', karat: '21', qty: '3', whole: '10', frac: '', paid: '149500', making: '3000', stamp: '', stampNone: true, stones: 'without' };
const coinLine = { id: 'r2', type: 'coin', karat: '21', qty: '1', whole: '6', frac: '28', paid: '50500', stones: 'without' };
t2('buildInvoice: quantity row keeps total grams, unit grams and line-total money', () => {
  const r = LM.buildInvoice(baseInv, [barLine, coinLine]);
  assert2.ok(!r.error, JSON.stringify(r.error));
  const [bar, coin] = r.rows;
  assert2.equal(bar.grams, 30); assert2.equal(bar.qty, 3); assert2.equal(bar.unitGrams, 10); assert2.equal(bar.paid, 149500); assert2.equal(bar.making, 3000); assert2.equal(bar.stamp, 0);
  assert2.equal(bar.invoiceId, 'inv1'); assert2.ok(!('tax' in bar));
  assert2.equal(coin.grams, 6.28); assert2.ok(!('qty' in coin)); assert2.ok(!('making' in coin)); assert2.ok(!('stamp' in coin)); // blank stays unknown
  assert2.deepEqual(r.invoice, { id: 'inv1', vatMode: 'has', subtotal: 175438.6, vat: 24561.4, total: 200000 });
});
t2('buildInvoice: unknown tax stores no figures; bad fields are listed and nothing is built', () => {
  const r = LM.buildInvoice({ id: 'i', date: '2026-01-02', mode: 'unknown' }, [coinLine]);
  assert2.deepEqual(r.invoice, { id: 'i', vatMode: 'unknown' });
  const bad = LM.buildInvoice(baseInv, [Object.assign({}, coinLine, { stones: '' , paid: '' , qty: '0'})]);
  assert2.ok(bad.error.includes('stones:0') && bad.error.includes('paid:0') && bad.error.includes('qty:0')); assert2.ok(!bad.rows);
  assert2.ok(LM.buildInvoice({ id: 'i', date: 'x', mode: 'none' }, [coinLine]).error);
  assert2.ok(LM.buildInvoice(baseInv, [Object.assign({}, coinLine, { type: 'jewelry' })]).error.includes('purpose:0'));
});
t2('mergeInvoice is retry safe and keeps older rows and invoices', () => {
  const built = LM.buildInvoice(baseInv, [barLine, coinLine]);
  const old = [{ id: 'old', grams: 5, karat: 21, paid: 1 }];
  const m1 = LM.mergeInvoice(old, undefined, built);
  assert2.equal(m1.items.length, 3); assert2.equal(m1.invoices.length, 1);
  const m2 = LM.mergeInvoice(m1.items, m1.invoices, built);
  assert2.equal(m2.items.length, 3); assert2.equal(m2.invoices.length, 1); assert2.equal(m2.added, 0);
  assert2.deepEqual(m2.items[0], old[0]);
});
t2('rows from a quantity line still work with the valuation (grams is the total)', () => {
  const r = LM.buildInvoice(baseInv, [barLine]).rows[0];
  assert2.equal(LM.netGrams(r), 30); assert2.equal(LM.qtyOf(r), 3); assert2.equal(LM.unitGramsOf(r), 10);
  assert2.equal(LM.qtyOf({ grams: 8 }), 1); assert2.equal(LM.unitGramsOf({ grams: 8 }), 8);
});
t2('commitWithRetry keeps other document keys and the invoices list, and passes invoices to the writer', async () => {
  const { commitWithRetry } = await import('../public/js/account.js');
  let doc = { v: 1, items: [{ id: 'a' }], invoices: [{ id: 'i0', vatMode: 'none' }], future: { x: 1 } }, saved = null, seen = null;
  await commitWithRetry({ load: async () => ({ data: doc, version: 'v1' }), save: async d => { saved = d; }, mutate: (it, inv) => { seen = inv; return { items: it.concat({ id: 'b' }) }; } });
  assert2.deepEqual(seen, [{ id: 'i0', vatMode: 'none' }]); assert2.deepEqual(saved.invoices, doc.invoices); assert2.deepEqual(saved.future, { x: 1 }); assert2.equal(saved.items.length, 2);
  await commitWithRetry({ load: async () => ({ data: doc, version: 'v1' }), save: async d => { saved = d; }, mutate: (it, inv) => ({ items: it, invoices: inv.concat({ id: 'i1' }) }) });
  assert2.equal(saved.invoices.length, 2);
  await commitWithRetry({ load: async () => ({ data: null, version: null }), save: async d => { saved = d; }, mutate: it => ({ items: [{ id: 'z' }] }) });
  assert2.deepEqual(saved, { v: 1, items: [{ id: 'z' }] });
});
t2('stones details are kept only for lines with stones and must be lighter than the line', () => {
  const w = Object.assign({}, coinLine, { stones: 'with', basis: 'total', stoneG: '1.5', promise: 'full' });
  const r = LM.buildInvoice(baseInv, [w]).rows[0];
  assert2.equal(r.basis, 'total'); assert2.equal(r.stoneG, 1.5); assert2.equal(r.promise, 'full');
  assert2.ok(LM.buildInvoice(baseInv, [Object.assign({}, w, { stoneG: '7' })]).error.includes('stoneG:0'));
  const wo = LM.buildInvoice(baseInv, [Object.assign({}, coinLine, { basis: 'net', stoneG: '1', promise: 'full' })]).rows[0];
  assert2.ok(!('basis' in wo) && !('stoneG' in wo) && !('promise' in wo));
});
t2('invoice meta: figures stored once, calculated third kept, bad figures refused', () => {
  assert2.deepEqual(LM.buildInvoiceMeta({ id: 'a', mode: 'has', sub: '100', vat: '14' }).invoice, { id: 'a', vatMode: 'has', subtotal: 100, vat: 14, total: 114 });
  assert2.deepEqual(LM.buildInvoiceMeta({ id: 'a', mode: 'none', sub: '5' }).invoice, { id: 'a', vatMode: 'none' });
  assert2.ok(LM.buildInvoiceMeta({ id: 'a', mode: 'has', sub: '1x', vat: '2' }).error);
  assert2.ok(LM.buildInvoiceMeta({ id: 'a', mode: 'has', sub: '500', total: '100' }).error);
  assert2.ok(LM.buildInvoiceMeta({ id: 'a', mode: 'zzz' }).error);
});
t2('invoice edit changes the record and only the date on that invoice rows; siblings of other invoices are untouched', () => {
  const items = [{ id: '1', invoiceId: 'A', purchaseDate: '2026-01-01', paid: 10, making: 5 }, { id: '2', invoiceId: 'A', purchaseDate: '2026-01-01', paid: 20 }, { id: '3', invoiceId: 'B', purchaseDate: '2026-01-01', paid: 30 }, { id: '4', purchaseDate: '2026-01-01' }];
  const invs = [{ id: 'A', vatMode: 'unknown' }, { id: 'B', vatMode: 'none' }];
  const r = LM.applyInvoiceEdit(items, invs, { id: 'A', vatMode: 'has', subtotal: 1, vat: 0.14, total: 1.14 }, '2026-02-02');
  assert2.deepEqual(r.items.map(x => x.purchaseDate), ['2026-02-02', '2026-02-02', '2026-01-01', '2026-01-01']);
  assert2.equal(r.items[0].paid, 10); assert2.equal(r.items[0].making, 5);
  assert2.deepEqual(r.items.slice(2), items.slice(2)); assert2.equal(r.invoices[0].vatMode, 'has'); assert2.deepEqual(r.invoices[1], invs[1]);
  assert2.equal(LM.applyInvoiceEdit(items, [], { id: 'A', vatMode: 'none' }, '2026-02-02').invoices.length, 1);
});
t2('pruneInvoices drops an invoice record only when no row uses it', () => {
  assert2.deepEqual(LM.pruneInvoices([{ id: '1', invoiceId: 'A' }], [{ id: 'A' }, { id: 'B' }]), [{ id: 'A' }]);
  assert2.deepEqual(LM.pruneInvoices([], [{ id: 'A' }]), []);
});

test('silver rows under their own key survive a write by an older page that only knows items and invoices', async () => {
  const { commitWithRetry } = await import('../public/js/account.js');
  const silver = [{ id: 's1', type: 'bar', metal: 'silver', fineness: 925, grams: 31.1, purchaseDate: '2026-01-01', extra: 'keep' }];
  let doc = { v: 1, items: [{ id: 'g1', type: 'bar', karat: 21, grams: 5 }], silver: JSON.parse(JSON.stringify(silver)) }, saved = null;
  // An older page: reads items only, replaces items only.
  await commitWithRetry({ load: async () => ({ data: doc, version: 1 }), save: async (d) => { saved = d; }, mutate: it => ({ items: it.concat({ id: 'g2', type: 'bar', karat: 24, grams: 1 }) }) });
  assert.deepEqual(saved.silver, silver);
  assert.equal(saved.items.length, 2);
  // A newer page replacing silver leaves gold items byte-identical.
  doc = saved;
  await commitWithRetry({ load: async () => ({ data: doc, version: 2 }), save: async (d) => { saved = d; }, mutate: (it, _i, sv) => ({ items: it, silver: sv.map(r => ({ ...r, grams: 40 })) }) });
  assert.equal(saved.silver[0].grams, 40); assert.equal(saved.silver[0].extra, 'keep'); assert.deepEqual(saved.items, doc.items);
});

// ---- partial valuation: market value needs net weight and a quote, not the price paid; gain/loss needs a price above zero
const PP = { 21: { buy: 5750, sell: 5810 } };
test('aggregate: all unpriced, stones known: value and weight known, paid and gain/loss unknown', () => {
  const a = L.aggregate([{ id: 'u', karat: 21, grams: 4.321, stones: 'without' }], PP);
  assert.equal(a.valued, 1); assert.ok(Math.abs(a.now - 4.321 * 5750) < 1e-6); assert.equal(a.grams, 4.321);
  assert.equal(a.pricedCount, 0); assert.equal(a.unpriced, 1); assert.equal(a.covered, 0); assert.equal(a.diff, null); assert.equal(a.percent, null);
});
test('aggregate: all priced matches the old result', () => {
  const a = L.aggregate([{ ...base }], P);
  assert.equal(a.covered, 1); assert.equal(a.valued, 1); assert.ok(Math.abs(a.now - 27840) < 1e-9); assert.ok(Math.abs(a.diff - (27840 - 19304)) < 1e-9); assert.equal(a.unpriced, 0);
});
test('aggregate: stones unknown is not valued and not zero; weight stays recorded', () => {
  const a = L.aggregate([{ id: 'x', karat: 21, grams: 6, paid: 30000 }, { id: 'y', karat: 21, grams: 2, stones: 'with' }], PP);
  assert.equal(a.valued, 0); assert.equal(a.now, 0); assert.equal(a.diff, null); assert.equal(a.grams, 8); assert.equal(a.netCount, 0); assert.equal(a.noGoldWeight, 2); assert.equal(a.partial, true);
});
test('aggregate: missing market quote values nothing and invents no gain', () => {
  const a = L.aggregate([{ id: 'x', karat: 24, grams: 6, paid: 30000, stones: 'without' }], PP);
  assert.equal(a.valued, 0); assert.equal(a.diff, null); assert.equal(a.percent, null); assert.equal(a.paidAll, 30000);
  assert.equal(L.valuation({ karat: 24, grams: 6, stones: 'without' }, PP).B, null);
});
test('aggregate and valuation: zero paid never makes a gain or a percent', () => {
  const r = { id: 'z', karat: 21, grams: 2, paid: 0, stones: 'without' };
  const a = L.aggregate([r], PP);
  assert.equal(a.valued, 1); assert.equal(a.covered, 0); assert.equal(a.diff, null); assert.equal(a.percent, null); assert.ok(a.now > 0);
  const v = L.valuation(r, PP).B; assert.equal(v.diff, null); assert.equal(v.percent, null); assert.equal(v.value, 2 * 5750);
});
test('aggregate: gross and net weight stay apart; milligram rounding survives', () => {
  const a = L.aggregate([{ id: 'a', karat: 21, grams: 4.321, stones: 'with', basis: 'total', stoneG: 0.5, paid: 1000 }, { id: 'b', karat: 21, grams: 3.1, stones: 'with' }], PP);
  assert.equal(a.grams, 7.421); assert.equal(a.netGrams, 3.821); assert.equal(a.netCount, 1); assert.equal(a.valued, 1); assert.equal(a.approx, false);
});
test('restored legacy record (no stones choice, no fees, additions) is kept and not valued', () => {
  const legacy = { id: 'l', label: 'خاتم', type: 'jewelry', karat: 21, grams: 5, purchaseDate: '2025-01-01', paid: 20000, additions: 1800 };
  const a = L.aggregate([legacy], PP);
  assert.equal(a.valued, 0); assert.equal(a.paidAll, 20000); assert.equal(a.grams, 5); assert.equal(a.diff, null);
});

// ---- save predicate and hint: purpose is required for jewelry only; hint and button share one predicate ----
test('save predicate and hint share one rule; purpose required for jewelry only', () => {
  const full = { type: 'bar', karat: '24', weight: true, paid: true, extras: true, stones: 'without', purpose: '' };
  assert.deepEqual(L.rowMissing(full), [], 'legacy bar without purpose is complete');
  assert.deepEqual(L.rowMissing({ ...full, type: 'coin', karat: '21' }), [], 'coin without purpose is complete');
  assert.deepEqual(L.rowMissing({ ...full, type: 'scrap', karat: '18' }), [], 'scrap without purpose is complete');
  assert.deepEqual(L.rowMissing({ ...full, type: 'bar', purpose: 'saving' }), [], 'an existing purpose is fine and kept');
  assert.deepEqual(L.rowMissing({ ...full, type: 'jewelry', karat: '21' }), ['غرض الاقتناء (زينة أو ادخار)'], 'jewelry without purpose stays blocked, named precisely');
  assert.deepEqual(L.rowMissing({ ...full, type: 'jewelry', karat: '21', purpose: 'adornment' }), []);
  assert.deepEqual(L.rowMissing({ type: '', karat: '', weight: false, paid: false, extras: false, stones: '', purpose: '' }), ['النوع', 'العيار', 'الوزن', 'المبلغ المدفوع', 'رقم المصنعية أو الدمغة', 'الفصوص (بفصوص أو بدون)']);
  assert.equal(L.missingHint([[]]), '');
  assert.equal(L.missingHint([['الوزن']]), 'ناقص الوزن.');
  assert.equal(L.missingHint([[], ['الوزن', 'الفصوص (بفصوص أو بدون)']]), 'سطر 2: ناقص الوزن، الفصوص (بفصوص أو بدون).');
  assert.ok(/راجعت الأرقام/.test(L.REVIEW_HINT));
});
