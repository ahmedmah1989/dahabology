const assert = require('node:assert/strict');
const { toHijri, hawlEnd, zakat } = require('../public/js/zakat.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const OK = { asOf: '2026-11-20', wornView: 'exempt', nisabGrams: 85, additionsMethod: 'per-lot', otherZakatableAssets: 'none-confirmed' };
const bar = { id: 'b', type: 'bar', karat: '24', grams: 100, purchaseDate: '2025-01-10', fundsSource: 'new' };
const blocked = (r, re) => { assert.equal(r.status, 'blocked'); assert.equal(r.amount, undefined); assert.equal(r.dueLots, undefined); if (re) assert.ok(r.blockers.some(b => re.test(b)), r.blockers.join('|')); };

// Hijri helpers
assert.deepEqual(toHijri('2026-11-20'), { y: 1448, m: 6, d: 10 });
assert.deepEqual(toHijri(hawlEnd('2025-03-01')), (h => ({ y: h.y + 1, m: h.m, d: h.d }))(toHijri('2025-03-01')));
assert.equal(toHijri('nope'), null);
// a day-30 start whose next-year month has 29 days has no same-day end: must be null, never guessed
let found = false;
for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2027, 0, 1); t += 86400000) { const s = new Date(t).toISOString().slice(0, 10); if (toHijri(s).d === 30 && hawlEnd(s) === null) { found = true; break; } }
assert.ok(found, 'day-30 case exists and returns null');

// Fail closed: no defaults for any method
for (const k of ['wornView', 'nisabGrams', 'additionsMethod', 'otherZakatableAssets', 'asOf']) { const o = Object.assign({}, OK); delete o[k]; blocked(zakat([bar], o)); }
blocked(zakat([bar], Object.assign({}, OK, { nisabGrams: 80 })));
blocked(zakat([bar], Object.assign({}, OK, { additionsMethod: 'merged' })), /Additions/);
blocked(zakat([bar], Object.assign({}, OK, { otherZakatableAssets: 'cash' })), /Aggregation/);
// hawl origin must be stated
blocked(zakat([Object.assign({}, bar, { fundsSource: undefined })], OK), /new money/);
blocked(zakat([Object.assign({}, bar, { fundsSource: 'prior-zakatable' })], OK), /prior-zakatable/);
// sold items, bad data, worn bar
blocked(zakat([Object.assign({}, bar, { sold: true })], OK), /sold/);
blocked(zakat([Object.assign({}, bar, { grams: 0 })], OK));
blocked(zakat([Object.assign({}, bar, { use: 'worn' })], OK));

// computed: due, 2.5%
let r = zakat([bar], Object.assign({ goldPricePerGram24: 6000 }, OK));
assert.equal(r.status, 'computed'); assert.equal(r.dueLots.length, 1); near(r.gramsDue, 2.5); near(r.amount, 15000);
// prior zakatable cash carries its hawl start
r = zakat([Object.assign({}, bar, { purchaseDate: '2025-09-01', fundsSource: 'prior-zakatable', fundsHawlStart: '2025-01-10' })], OK);
assert.equal(r.dueLots.length, 1); assert.equal(r.lots[0].hawlStart, '2025-01-10');
blocked(zakat([Object.assign({}, bar, { fundsSource: 'prior-zakatable', fundsHawlStart: '2025-02-01' })], OK), /prior-zakatable/);
// not yet due
r = zakat([bar], Object.assign({}, OK, { asOf: '2025-06-01' })); assert.equal(r.status, 'computed'); assert.equal(r.dueLots.length, 0); assert.equal(r.notYetDue.length, 1); assert.equal(r.gramsDue, 0);
// below nisab (97 g of 21k = 84.875)
r = zakat([{ id: 'x', type: 'bar', karat: '21', grams: 97, purchaseDate: '2024-01-01', fundsSource: 'new' }], OK); assert.match(r.reason, /nisab/); assert.equal(r.gramsDue, undefined);
// nisab option changes the outcome
const g90 = { id: 'g', type: 'bar', karat: '24', grams: 90, purchaseDate: '2025-01-10', fundsSource: 'new' };
assert.equal(zakat([g90], OK).dueLots.length, 1);
assert.equal(zakat([g90], Object.assign({}, OK, { nisabGrams: 91.6 })).dueLots.length, 0);

// worn jewelry
const ring = { id: 'r', type: 'jewelry', karat: '21', grams: 120, purchaseDate: '2025-01-10', use: 'worn', alsoSavings: false };
assert.equal(zakat([ring], OK).rows[0].status, 'exempt');
blocked(zakat([Object.assign({}, ring, { alsoSavings: undefined })], OK), /also bought for saving/);
blocked(zakat([Object.assign({}, ring, { use: undefined })], OK), /worn\/unused/);
r = zakat([Object.assign({}, ring, { fundsSource: 'new' })], Object.assign({}, OK, { wornView: 'zakatable' })); assert.equal(r.rows[0].status, 'counts'); assert.equal(r.dueLots.length, 1);
r = zakat([Object.assign({}, ring, { alsoSavings: true, fundsSource: 'new' })], OK); assert.equal(r.rows[0].status, 'counts');
// declared change of purpose starts the hawl there
const ch = Object.assign({}, ring, { purposeChangeDate: '2026-05-01' });
r = zakat([ch], OK); assert.equal(r.lots[0].hawlStart, '2026-05-01'); assert.equal(r.dueLots.length, 0);
blocked(zakat([Object.assign({}, ring, { purposeChangeDate: '2023-01-01' })], OK));
assert.equal(zakat([Object.assign({}, ring, { purposeChangeDate: '2027-01-01' })], OK).rows[0].status, 'exempt');

// per-lot additions: each lot keeps its own hawl; nisab date gates earlier lots
const s1 = { id: 's1', type: 'bar', karat: '24', grams: 50, purchaseDate: '2024-01-01', fundsSource: 'new' };
const s2 = { id: 's2', type: 'bar', karat: '24', grams: 40, purchaseDate: '2025-02-01', fundsSource: 'new' };
const s3 = { id: 's3', type: 'bar', karat: '24', grams: 10, purchaseDate: '2026-06-01', fundsSource: 'new' };
r = zakat([s1, s2, s3], OK);
assert.equal(r.nisabReachedOn, '2025-02-01'); assert.equal(r.lots.find(l => l.id === 's1').hawlStart, '2025-02-01');
assert.deepEqual(r.dueLots.map(l => l.id).sort(), ['s1', 's2']); assert.deepEqual(r.notYetDue.map(l => l.id), ['s3']); near(r.gramsDue, 90 * 0.025);

// carryover edge cases block instead of guessing
r = zakat([Object.assign({}, bar, { purchaseDate: '2025-09-01', fundsSource: 'prior-zakatable', fundsHawlStart: '2025-01-10' }), { id: 'z', type: 'bar', karat: '24', grams: 10, purchaseDate: '2026-10-01', fundsSource: 'new' }], OK); assert.equal(r.status, 'computed'); assert.deepEqual(r.dueLots.map(l => l.id), ['b']); assert.deepEqual(r.notYetDue.map(l => l.id), ['z']); // 100 g carried lot alone covers nisab, so only the small new lot is not-yet-due
blocked(zakat([Object.assign({}, bar, { grams: 40, purchaseDate: '2025-09-01', fundsSource: 'prior-zakatable', fundsHawlStart: '2025-01-10' }), { id: 'z', type: 'bar', karat: '24', grams: 50, purchaseDate: '2026-10-01', fundsSource: 'new' }], OK), /carryover/);
blocked(zakat([Object.assign({}, bar, { purchaseDate: '2026-10-01', fundsSource: 'prior-zakatable', fundsHawlStart: '2025-10-01' })], OK), /carried cash hawl ended/);
// asOf before everything: purchase after asOf blocks, never a false due
blocked(zakat([bar], Object.assign({}, OK, { asOf: '2024-12-01' })), /after asOf/);
// asOf near the hawl end is blocked (sighting margin); second hawl is blocked
const end = hawlEnd('2025-01-10');
blocked(zakat([bar], Object.assign({}, OK, { asOf: end })), /sighting/);
blocked(zakat([bar], Object.assign({}, OK, { asOf: '2027-12-01' })), /second hawl/);

// ---- elewa-annual-date method ----
const { zakatElewa } = require('../public/js/zakat.js');
const E = { asOf: '2026-11-20', zakatDate: { m: 6, d: 10 }, goldPricePerGram24: 6000, otherZakatableNet: 0, keptAboveNisabThroughFirstHawl: true, earlierYears: 'none' };
const eb = r => { assert.equal(r.status, 'blocked'); assert.equal(r.amount, undefined); return r.blockers.join('|'); };
const ebar = { id: 'e', type: 'bar', karat: '24', grams: 100, purchaseDate: '2025-01-10' };
// blocked without each required input
for (const k of ['asOf', 'zakatDate', 'goldPricePerGram24', 'otherZakatableNet']) { const o = Object.assign({}, E); delete o[k]; eb(zakatElewa([ebar], o)); }
eb(zakatElewa([ebar], Object.assign({}, E, { zakatDate: { m: 6, d: 31 } })));
assert.match(eb(zakatElewa([ebar], Object.assign({}, E, { otherZakatableNet: 1000 }))), /reached nisab/);
// due: whole base x 2.5%, not only the excess over nisab
let er = zakatElewa([ebar], E); assert.equal(er.status, 'computed'); assert.equal(er.due, true); near(er.base, 600000); near(er.amount, 15000);
// cash pooled with gold
er = zakatElewa([ebar], Object.assign({}, E, { otherZakatableNet: 40000, nisabReachedOn: '2025-01-10' })); near(er.base, 640000); near(er.amount, 16000);
// below nisab on the date (84 g) -> not due
er = zakatElewa([Object.assign({}, ebar, { grams: 84 })], E); assert.equal(er.due, false); assert.match(er.reason, /below nisab/);
// hawl not yet complete
er = zakatElewa([Object.assign({}, ebar, { purchaseDate: '2026-03-01' })], E); assert.equal(er.due, false); assert.match(er.reason, /full Hijri year/);
// jewelry: purpose required; adornment within customary exempt; beyond customary or saving counts; saving counts even if worn
const j = { id: 'j', type: 'jewelry', karat: '21', grams: 120, purchaseDate: '2025-01-10' };
eb(zakatElewa([j], E)); eb(zakatElewa([Object.assign({}, j, { purpose: 'adornment' })], E));
const okc = { lawful: true, immediateUse: true, customaryAmount: true, wearable: true };
assert.equal(zakatElewa([Object.assign({}, j, { purpose: 'adornment', adornmentChecks: okc })], E).rows[0].status, 'exempt');
assert.equal(zakatElewa([Object.assign({}, j, { purpose: 'adornment', adornmentChecks: Object.assign({}, okc, { customaryAmount: false }) })], E).rows[0].status, 'blocked'); // symposium: only the excess is zakatable, not computed, so no number
for (const k of ['lawful', 'immediateUse']) assert.equal(zakatElewa([Object.assign({}, j, { purpose: 'adornment', adornmentChecks: Object.assign({}, okc, { [k]: false }) })], E).rows[0].status, 'counts');
eb(zakatElewa([Object.assign({}, j, { purpose: 'adornment', adornmentChecks: { lawful: true } })], E));
// broken jewelry: needs the break date; counts from then
eb(zakatElewa([Object.assign({}, j, { purpose: 'adornment', adornmentChecks: Object.assign({}, okc, { wearable: false }) })], E));
eb(zakatElewa([Object.assign({}, j, { purpose: 'adornment', adornmentChecks: Object.assign({}, okc, { wearable: false }), brokenOn: '2026-06-01' })], E));
const brk = Object.assign({}, ebar, { type: 'broken', brokenOn: '2026-06-01' });
eb(zakatElewa([brk], E)); eb(zakatElewa([Object.assign({}, brk, { plan: 'repair' })], E)); eb(zakatElewa([Object.assign({}, brk, { plan: 'melt-or-sell', brokenOn: '2027-06-01' })], E));
er = zakatElewa([Object.assign({}, brk, { plan: 'melt-or-sell' })], E); assert.equal(er.status, 'computed'); assert.equal(er.due, false);
// additions after the nisab date and dips are not tracked (Elewa: what exists on the zakat date counts)
er = zakatElewa([ebar, Object.assign({}, ebar, { id: 'b2', grams: 5, purchaseDate: '2025-09-01' })], E); assert.equal(er.status, 'computed'); near(er.base, 105 * 6000);
assert.equal(zakatElewa([ebar, Object.assign({}, ebar, { id: 'b2', grams: 5, purchaseDate: '2025-09-01', fundedFromCounted: true })], E).status, 'computed');
assert.ok(zakatElewa([ebar], E).ruleSources.length >= 5);
// scrap counts like bars (Elewa; symposium on broken gold)
assert.equal(zakatElewa([Object.assign({}, ebar, { type: 'scrap' })], E).due, true);
er = zakatElewa([Object.assign({}, j, { purpose: 'saving' })], E); assert.equal(er.rows[0].status, 'counts'); assert.equal(er.due, true); near(er.base, 120 * 21 / 24 * 6000);
// declared change of purpose starts counting at that date
er = zakatElewa([Object.assign({}, j, { purpose: 'adornment', adornmentChecks: okc, purposeChangeDate: '2026-06-01' })], E); assert.equal(er.due, false);
// purpose on a bar, sold item, hawl end near asOf are blocked
eb(zakatElewa([Object.assign({}, ebar, { purpose: 'saving' })], E)); eb(zakatElewa([Object.assign({}, ebar, { sold: true })], E));
eb(zakatElewa([ebar], Object.assign({}, E, { asOf: hawlEnd('2025-01-10') })));
console.log('Zakat engine tests passed.');
{ // Hijri day 30 that does not exist in the latest year is reported, never silently dropped
  let hit = 0;
  for (let y = 2025; y < 2027; y++) for (let m = 1; m <= 12; m++) { const r = zakatElewa([ebar], { asOf: y + '-12-20', zakatDate: { m, d: 30 }, goldPricePerGram24: 400, otherZakatableNet: 0 }); if (r.status === 'blocked' && /day 30/.test(r.blockers.join())) hit++; }
  assert.ok(hit > 0);
}
eb(zakatElewa([ebar], Object.assign({}, E, { otherZakatableNet: NaN })));
eb(zakatElewa([ebar], Object.assign({}, E, { goldPricePerGram24: NaN })));

// first hawl needs the confirmation; a later year needs prior years settled; neither is defaulted
{
  const noK = Object.assign({}, E); delete noK.keptAboveNisabThroughFirstHawl;
  const noEY = Object.assign({}, E); delete noEY.earlierYears;
  assert.match(eb(zakatElewa([ebar], noEY)), /Earlier years/);
  assert.match(eb(zakatElewa([ebar], Object.assign({}, E, { earlierYears: 'yes' }))), /Earlier years/);
  assert.equal(zakatElewa([ebar], Object.assign({}, E, { earlierYears: 'settled' })).due, true);
  assert.match(eb(zakatElewa([ebar], noK)), /First hawl/);
  const later = Object.assign({}, ebar, { purchaseDate: '2023-01-10' });
  assert.match(eb(zakatElewa([later], noK)), /not the first/);
  assert.equal(zakatElewa([later], Object.assign({}, noK, { earlierYears: 'settled' })).due, true);
  assert.equal(zakatElewa([later], Object.assign({}, noK, { earlierYears: 'settled' })).firstHawl, false);
  assert.equal(zakatElewa([ebar], E).firstHawl, true);
}

// hardening: malformed input never yields an amount, and inputs are not mutated
{
  const snap = JSON.stringify([ebar, E]);
  zakatElewa([ebar], E);
  assert.equal(JSON.stringify([ebar, E]), snap);
  eb(zakatElewa([], E));
  eb(zakatElewa(null, E));
  eb(zakatElewa([ebar], null));
  eb(zakatElewa([Object.assign({}, ebar, { karat: '14' })], E));
  eb(zakatElewa([Object.assign({}, ebar, { grams: -5 })], E));
  eb(zakatElewa([Object.assign({}, ebar, { grams: 'abc' })], E));
  eb(zakatElewa([Object.assign({}, ebar, { purchaseDate: '2025-02-30' })], E));
  eb(zakatElewa([Object.assign({}, ebar, { type: 'platinum' })], E));
  eb(zakatElewa([ebar], Object.assign({}, E, { goldPricePerGram24: 0 })));
  eb(zakatElewa([ebar], Object.assign({}, E, { goldPricePerGram24: -1 })));
  eb(zakatElewa([ebar], Object.assign({}, E, { otherZakatableNet: -1 })));
  eb(zakatElewa([ebar], Object.assign({}, E, { zakatDate: { m: 0, d: 5 } })));
  // keptAboveNisab must be exactly true, not truthy
  const noK = Object.assign({}, E, { keptAboveNisabThroughFirstHawl: 'yes' });
  assert.match(eb(zakatElewa([ebar], noK)), /First hawl/);
  // exactly 85 g of 24k is nisab (counts); just under does not
  assert.equal(zakatElewa([Object.assign({}, ebar, { grams: 85 })], E).due, true);
  assert.equal(zakatElewa([Object.assign({}, ebar, { grams: 84.99 })], E).due, false);
  // 18k jewelry saved: pure weight, not gross weight, decides nisab
  assert.equal(zakatElewa([{ id: 'k', type: 'jewelry', purpose: 'saving', karat: '18', grams: 110, purchaseDate: '2025-01-10' }], E).due, false);
  assert.equal(zakatElewa([{ id: 'k', type: 'jewelry', purpose: 'saving', karat: '18', grams: 115, purchaseDate: '2025-01-10' }], E).due, true);
}
console.log('Hardening tests passed.');
