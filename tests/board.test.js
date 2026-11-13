const assert = require('node:assert/strict');
const { pin, verdict, karat, change, compare } = require('../public/js/board.js');
const { quote } = require('../public/js/calc.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);

// meter
assert.equal(pin(-4), 0); assert.equal(pin(8), 100); assert.equal(pin(-9), 0); assert.equal(pin(20), 100); near(pin(2), 50);
assert.equal(verdict(-0.5).key, 'low'); assert.equal(verdict(0).key, 'near'); assert.equal(verdict(2).key, 'near');
assert.equal(verdict(2.01).key, 'mid'); assert.equal(verdict(4).key, 'mid'); assert.equal(verdict(4.5).key, 'high'); assert.equal(verdict(NaN).key, 'none');

// karats: 24/21 published, 18 derived from 24 only
const a = { '24': { sell: 6800, buy: 6740 }, '21': { sell: 5950, buy: 5900 } };
assert.deepEqual(karat(a, '21'), { sell: 5950, buy: 5900, derived: false });
assert.deepEqual(karat(a, '18'), { sell: 5100, buy: 5055, derived: true });
assert.equal(karat({}, '18'), null); assert.equal(karat(null, '21'), null);

// change vs last archived close strictly before today
const days = [{ d: '2026-11-11', '21': { close: 5900 } }, { d: '2026-11-12', '21': { close: 6000 } }, { d: '2026-11-13', '21': { close: 5800 } }];
const c = change(days, '21', 5940, '2026-11-13'); near(c.diff, -60); near(c.percent, -1); assert.equal(c.date, '2026-11-12');
assert.equal(change(days, '21', 5940, '2026-11-11'), null); assert.equal(change([], '21', 5940, '2026-11-13'), null); assert.equal(change(days, '24', 6800, '2026-11-13'), null);

// my purchase
const m = compare(5800, 5900, 10); near(m.diff, 100); near(m.total, 1000); near(m.percent, 100 / 58);
assert.equal(compare(0, 5900), null); assert.equal(compare(5800, 5900).total, null);

// calculator
assert.equal(quote({ mode: 'buy', by: 'money', price: 0, amount: 1000 }), null);
let q = quote({ mode: 'buy', by: 'money', price: 5000, amount: 100000 }); near(q.grams, 20); near(q.total, 100000); near(q.extra, 0);
q = quote({ mode: 'buy', by: 'grams', price: 5000, amount: 10, making: 100, stamp: 10, vat: 14 });
near(q.perGram, 5124); near(q.total, 51240); near(q.gold, 50000); near(q.making, 1000); near(q.tax, 140); near(q.stamp, 100); near(q.extra, 1240);
q = quote({ mode: 'buy', by: 'money', price: 5000, amount: 51240, making: 100, stamp: 10, vat: 14 }); near(q.grams, 10);
q = quote({ mode: 'sell', price: 4950, amount: 10, making: 100 }); near(q.total, 49500);
console.log('Meter bands, derived 18k, archived change, purchase comparison and calculator fees passed.');
