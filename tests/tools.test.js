const assert = require('node:assert/strict');
const { prices, inspect, wallet, walletNowText, walletNotes } = require('../public/js/tools.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const a = { '24': { sell: 6800, buy: 6740 }, '21': { sell: 5950, buy: 5900 } };

// prices per karat
assert.deepEqual(prices(a, '21'), { sell: 5950, buy: 5900 });
assert.deepEqual(prices(a, '18'), { sell: 5100, buy: 5055 });
assert.equal(prices(null, '21'), null); assert.equal(prices({}, '18'), null);

// invoice: 8 g of 21k billed at 49,424 = gold 47,600 + 1,824 extra (228/g = 200 making + 28 tax at 14%)
let r = inspect({ sell: 5950, buy: 5900, grams: 8, total: 49424, vat: 14 });
near(r.gold, 47600); near(r.extra, 1824); near(r.extraPerGram, 228); near(r.makingPerGram, 200); near(r.taxPerGram, 28);
near(r.extraPercent, 1824 / 49424 * 100); near(r.resale, 47200); near(r.loss, 2224); assert.equal(r.belowGold, false);
r = inspect({ sell: 5950, buy: NaN, grams: 8, total: 47000, vat: 14 }); assert.equal(r.belowGold, true); assert.equal(r.resale, null); assert.equal(r.loss, null);
assert.equal(inspect({ sell: 0, grams: 8, total: 100 }), null); assert.equal(inspect({ sell: 5950, grams: 0, total: 100 }), null);
r = inspect({ sell: 5000, buy: 4950, grams: 10, total: 51000 }); near(r.makingPerGram, 100); near(r.taxPerGram, 0);

// wallet: valued at the dealer's buy price; totals only when every row can be priced
let w = wallet([{ id: 'x', k: '21', g: 8, paid: 49424 }, { id: 'y', k: '24', g: 10, paid: 60000 }], a);
near(w.rows[0].now, 47200); near(w.rows[0].diff, -2224); near(w.rows[1].now, 67400); near(w.rows[1].diff, 7400);
near(w.paid, 109424); near(w.now, 114600); near(w.diff, 5176); near(w.grams, 18); near(w.pure, 8 * 21 / 24 + 10);
w = wallet([{ id: 'x', k: '21', g: 8, paid: 49424 }], null); assert.equal(w.now, null); assert.equal(w.diff, null); near(w.paid, 49424);
w = wallet([], a); assert.equal(w.now, null); near(w.paid, 0);
console.log('Invoice breakdown, resale loss, and wallet valuation passed.');

// A gift or other zero-cost holding has no finite percentage return.
const { percentageSuffix } = require('../public/js/tools.js');
w = wallet([{k:'21',g:10,paid:0}], {'21':{buy:5500,sell:5550}});
assert.equal(w.now,55000);assert.equal(w.diff,55000);assert.equal(w.percent,null);assert.equal(w.rows[0].percent,null);
assert.equal(percentageSuffix(w.percent,String),' (النسبة غير متاحة)');
assert.equal(percentageSuffix(null,String),' (النسبة غير متاحة)');
assert.equal(percentageSuffix(0,String),' (0%)');
assert.equal(percentageSuffix(-5,String),' (-5%)');

const test2 = require('node:test');
test2('wallet headline: 0 only for an empty account; unpriced pieces make it unknown; valued pieces show the value', () => {
  assert.equal(walletNowText(0, 0, false, ''), '0 جنيه');
  assert.equal(walletNowText(0, 2, false, ''), '—');
  assert.equal(walletNowText(1, 2, true, '24,846 جنيه'), '24,846 جنيه');
  assert.equal(walletNowText(1, 0, false, ''), '—');
});

test2('wallet notes name what each total covers', () => {
  const egp = v => String(v);
  const mixed = { count: 3, valued: 2, covered: 1, paidCovered: 100, paidAll: 150, partial: true, netCount: 2, netGrams: 9 };
  const n = walletNotes(mixed, egp);
  assert.match(n.cover, /2 من 3/); assert.match(n.cover, /1 قطعة معروف سعر شرائها/); assert.match(n.weight, /9 جم/); assert.equal(n.diffScope, ' (على 1 من 3 قطعة)');
  assert.match(walletNotes({ count: 1, valued: 0, covered: 0, netCount: 0, netGrams: 0 }, egp).cover, /لسه ما اتحسبتش/);
  assert.match(walletNotes({ count: 1, valued: 1, covered: 0, paidCovered: 0, paidAll: 0, partial: false, netCount: 1, netGrams: 4 }, egp).cover, /غير متاح/);
  assert.match(walletNotes({ count: 1, valued: 0, covered: 0, netCount: 0, netGrams: 0 }, egp).weight, /غير معروف/);
  assert.equal(walletNotes({ count: 1, valued: 1, covered: 1, paidCovered: 1, paidAll: 1, partial: false, netCount: 1, netGrams: 4 }, egp).weight, '');
  assert.deepEqual(walletNotes({ count: 0 }, egp), { weight: '', diffScope: '', cover: '' });
});
