// Review state: suggestions are untrusted, only confirmed values leave, bad input and OCR failure fall back to manual entry.
const test = require('node:test'), assert = require('node:assert');
globalThis.DHB_LEDGER = require('../public/js/ledger-model.js');
const today = new Date('2026-11-21T00:00:00Z');
const mods = () => Promise.all([import('../public/js/invoice-review-state.js'), import('../public/js/invoice-parse.js')]);

test('suggestions never become values until typed or tapped AND confirmed', async () => {
  const [S, P] = await mods();
  const r = S.createReview(P.parseInvoice('عيار 21\nالوزن: 8,60 جرام\n14/03/2025\nالإجمالي: 31,250', { today }), { today });
  assert.deepEqual(r.confirmedValues(), {});
  assert.equal(r.rows.grams.input, '');
  r.suggest('grams'); assert.equal(r.rows.grams.input, '8.6'); assert.deepEqual(r.confirmedValues(), {});
  assert.ok(r.confirm('grams')); assert.deepEqual(r.confirmedValues(), { grams: 8.6 });
});

test('owner correcting a misread number replaces the suggestion; editing after confirm un-confirms', async () => {
  const [S, P] = await mods();
  const r = S.createReview(P.parseInvoice('الوزن: 8,60 جرام', { today }), { today });
  r.suggest('grams'); r.confirm('grams');
  r.setInput('grams', '8.45'); assert.deepEqual(r.confirmedValues(), {});
  assert.ok(r.confirm('grams')); assert.equal(r.confirmedValues().grams, 8.45);
});

test('invalid or empty input is rejected and nothing is confirmed', async () => {
  const [S] = await mods();
  const r = S.createReview(null, { today });
  assert.equal(r.confirm('paid'), false); assert.ok(r.rows.paid.error);
  for (const [f, v] of [['grams', 'abc'], ['grams', '0'], ['grams', '99999'], ['karat', '22'], ['karat', '20'], ['paid', '-5'], ['paid', '12x'], ['purchaseDate', '2027-01-01'], ['purchaseDate', '2025-02-30'], ['purchaseDate', '14/03/2025']]) {
    r.setInput(f, v); assert.equal(r.confirm(f), false, f + ' ' + v);
  }
  assert.deepEqual(r.confirmedValues(), {}); assert.equal(r.allConfirmed(), false);
});

test('OCR failure or skip (null) gives empty manual-entry rows with no suggestions', async () => {
  const [S] = await mods();
  const r = S.createReview(null, { today });
  for (const f of S.FIELDS) assert.deepEqual(r.rows[f].suggestions, []);
  r.setInput('karat', '21'); r.setInput('grams', '8.45'); r.setInput('purchaseDate', '2025-03-14'); r.setInput('paid', '31,250');
  S.FIELDS.forEach((f) => assert.ok(r.confirm(f)));
  assert.deepEqual(r.confirmedValues(), { karat: 21, grams: 8.45, purchaseDate: '2025-03-14', paid: 31250 }); assert.ok(r.allConfirmed());
});

test('conflicting readings are offered as candidates, not chosen', async () => {
  const [S, P] = await mods();
  const r = S.createReview(P.parseInvoice('الإجمالي: 21,480\nالإجمالي: 21,840', { today }), { today });
  assert.deepEqual(r.rows.paid.suggestions, ['21480', '21840']); assert.equal(r.rows.paid.input, ''); assert.deepEqual(r.confirmedValues(), {});
});

test('review module makes no network calls and exposes no save', async () => {
  global.fetch = () => { throw new Error('network used'); };
  const [S, P] = await mods();
  const r = S.createReview(P.parseInvoice('عيار 21', { today }), { today }); r.suggest('karat'); r.confirm('karat');
  assert.deepEqual(Object.keys(r).sort(), ['allConfirmed', 'confirm', 'confirmedValues', 'rows', 'setInput', 'suggest', 'unconfirm']);
});

test('arabic-indic typing is accepted for manual entry and suppressed OCR offers no chips', async () => {
  const [S, P] = await mods();
  const r = S.createReview(P.parseInvoice('الإجمالي: ٣١٬٢٥٠', { today }), { today });
  for (const f of S.FIELDS) assert.deepEqual(r.rows[f].suggestions, []);
  r.setInput('paid', '٣١٬٢٥٠'); assert.ok(r.confirm('paid')); r.setInput('grams', '٨٫٤٥'); assert.ok(r.confirm('grams'));
  r.setInput('purchaseDate', '٢٠٢٥-٠٣-١٤'); assert.ok(r.confirm('purchaseDate'));
  assert.deepEqual(r.confirmedValues(), { paid: 31250, grams: 8.45, purchaseDate: '2025-03-14' });
});

test('wallet photo flow ships with automatic reading OFF: no OCR call and no suggestions are reachable', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/invoice-review.js'), 'utf8');
  assert.match(src, /const OCR_SUGGESTIONS = false;/);
  assert.match(src, /if \(!OCR_SUGGESTIONS\) msg\([^)]*\);\s*\n\s*else try \{ const o = await ocrFile\(file\)/);
  assert.equal((src.match(/ocrFile\(/g) || []).length, 2); // the definition and the single guarded call
});

test('review confirm uses the strict reader: 46,5 is 46.5 not 465, 46.000 is unclear, 3.1259 g refused, Arabic digits read', async () => {
  const [S] = await mods();
  assert.deepEqual(S.validate('paid', '46,5', today), { ok: true, value: 46.5 });
  assert.deepEqual(S.validate('paid', '٤٦٬٠٠٠', today), { ok: true, value: 46000 });
  assert.equal(S.validate('paid', '46.000', today).ok, false);
  assert.equal(S.validate('paid', '46.123', today).ok, false);
  assert.deepEqual(S.validate('grams', '٣٫١٢٥', today), { ok: true, value: 3.125 });
  assert.deepEqual(S.validate('grams', '3,125', today), { ok: true, value: 3.125 });
  assert.equal(S.validate('grams', '3.1259', today).ok, false);
});
