// Calculator "by amount": the purchasable weight is rounded down to 3 decimals, every figure comes from that weight,
// the entered amount is kept as `budget`, and the leftover is `remaining`. Cost never exceeds the budget.
const assert = require('node:assert/strict');
const { quote } = require('../public/js/calc.js');
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), a + ' vs ' + b);
const on3 = g => Math.abs(g * 1000 - Math.round(g * 1000)) < 1e-6;

// fixed cases from the live-site audit (Nov 28): headline weight and breakdown weight were 17.211 vs 17.212
let q = quote({ mode: 'buy', by: 'money', price: 5810, amount: 100000 });
assert.equal(q.grams, 17.211); near(q.total, 99995.91, 1e-7); near(q.remaining, 4.09, 1e-4); near(q.budget, 100000);
assert.ok(q.total <= q.budget && q.remaining >= 0); near(q.total + q.remaining, q.budget);
q = quote({ mode: 'buy', by: 'money', price: 5810, amount: 100000, making: 150, stamp: 20, vat: 14 });
assert.equal(q.grams, 16.663); near(q.remaining, 5.34, 1e-3);
near(q.gold + q.making + q.stamp + q.tax, q.total);
q = quote({ mode: 'buy', by: 'money', price: 4980, amount: 50000, making: 200, vat: 14 });
assert.equal(q.grams, 9.6); near(q.remaining, 3.2, 1e-3);

// exact fit: no remainder, no off-by-one from float error (20 g at 5000, and 10 g at 5124)
q = quote({ mode: 'buy', by: 'money', price: 5000, amount: 100000 }); assert.equal(q.grams, 20); assert.equal(q.remaining, 0);
q = quote({ mode: 'buy', by: 'money', price: 5000, amount: 51240, making: 100, stamp: 10, vat: 14 }); assert.equal(q.grams, 10); assert.equal(q.remaining, 0);
q = quote({ mode: 'buy', by: 'money', price: 5810, amount: 5810 * 3.125 }); assert.equal(q.grams, 3.125); assert.equal(q.remaining, 0);
q = quote({ mode: 'buy', by: 'money', price: 0.1, amount: 0.3 }); assert.equal(q.grams, 3); // 0.3/0.1 is 2.9999999999999996 in floats

// below one milligram: nothing buyable, whole amount remains, no NaN/negative
q = quote({ mode: 'buy', by: 'money', price: 5810, amount: 5 });
assert.equal(q.grams, 0); assert.equal(q.total, 0); near(q.remaining, 5); assert.equal(q.extra, 0);
// just under one milligram's price and exactly one milligram's price
q = quote({ mode: 'buy', by: 'money', price: 5000, amount: 4.999 }); assert.equal(q.grams, 0);
q = quote({ mode: 'buy', by: 'money', price: 5000, amount: 5 }); assert.equal(q.grams, 0.001); assert.equal(q.remaining, 0);

// property check over many price/amount/fee combinations
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (let i = 0; i < 20000; i++) {
  const price = 1 + rnd() * 9000, amount = rnd() * 2e6, making = rnd() < .5 ? 0 : rnd() * 400, stamp = rnd() < .5 ? 0 : rnd() * 50, vat = rnd() < .5 ? 0 : 14;
  const r = quote({ mode: 'buy', by: 'money', price, amount, making, stamp, vat });
  if (!r) { assert.ok(!(amount > 0)); continue; }
  assert.ok(on3(r.grams), 'weight on 0.001 grid'); assert.ok(r.total <= r.budget * (1 + 1e-12), 'cost within budget');
  assert.ok(r.remaining >= 0, 'remaining not negative'); near(r.total + r.remaining, r.budget, 1e-9);
  assert.ok(r.remaining < r.perGram * 0.001 * (1 + 1e-9) + 1e-9, 'one more milligram would not fit');
  near(r.gold + r.making + r.stamp + r.tax, r.total, 1e-9);
}
// by weight and sell are unchanged: no budget fields, exact weight kept
q = quote({ mode: 'buy', by: 'grams', price: 5810, amount: 3.1257, making: 100 });
assert.equal(q.grams, 3.1257); assert.equal(q.budget, undefined); assert.equal(q.remaining, undefined);
q = quote({ mode: 'sell', price: 5750, amount: 10 }); near(q.total, 57500); assert.equal(q.budget, undefined);
console.log('Calculator by-amount floor, remaining and budget invariants passed.');
