// Invoice OCR suggestions: only evidence-backed values are prefilled; ambiguous or misread fields stay empty; every field needs owner confirmation.
const test = require('node:test'), assert = require('node:assert');
const today = new Date('2026-11-21T00:00:00Z');
const load = () => import('../public/js/invoice-parse.js');

test('clean western-digit invoice (real OCR output) prefills all four fields', async () => {
  const { parseInvoice, prefill } = await load();
  const p = parseInvoice('محلات الذهب النموذجية\nفاتورة رقم 2291\nالتاريخ: 14/03/2025\nالصنف: دبلة ذهب عيار 18\nالوزن: 5.10 جم\nالمصنعية: 600 جنيه\nالإجمالي: 21,480 جنيه', { today });
  assert.deepEqual(prefill(p), { karat: 18, grams: 5.1, purchaseDate: '2025-03-14', paid: 21480 });
});

test('arabic-indic digits: every numeric field is suppressed (measured: 31,250 was read as 10,600)', async () => {
  const { parseInvoice, prefill } = await load();
  const p = parseInvoice('التاريخ: ١٤/٠٣/٢٠٢٥\nخاتم ذهب عيار ٢١\nالوزن: ٨٫٤٥ جرام\nالإجمالي: ‎"1060٠‏ جنيه', { today });
  assert.deepEqual(prefill(p), {}); assert.equal(p.suppressed, 'arabic-indic-digits');
  for (const k of ['karat', 'grams', 'purchaseDate', 'paid']) { assert.equal(p[k].status, 'missing'); assert.equal(p[k].value, null); assert.equal(p[k].candidates, undefined); }
  assert.equal((await load()).normalizeDigits('٨٫٤٥'), '8.45');
});

test('low OCR confidence on digits suppresses all numeric suggestions', async () => {
  const { parseInvoice, prefill } = await load();
  const t = 'عيار 21\nالوزن: 8.45 جم\nالإجمالي: 31,250';
  assert.deepEqual(prefill(parseInvoice(t, { today, minDigitConfidence: 55 })), {});
  assert.equal(parseInvoice(t, { today, minDigitConfidence: 55 }).suppressed, 'low-confidence');
  assert.equal(prefill(parseInvoice(t, { today, minDigitConfidence: 93 })).paid, 31250);
});

test('real garbled OCR output leaves fields empty instead of guessing', async () => {
  const { parseInvoice, prefill } = await load();
  const p = parseInvoice('فاتورة رقم ‎١91‏\nالتاريخ: 16/0\nالصنف: خاتم ذهب عيار ‎1١‏\nالوزن: 60,/ جرام\nالإجمالي: ‎٠10‏ جنيه', { today });
  const f = prefill(p);
  assert.equal(f.grams, undefined); assert.equal(f.purchaseDate, undefined); assert.equal(f.karat, undefined);
  assert.equal(p.grams.status, 'missing'); assert.ok(p.paid.status !== 'ok' || p.paid.value !== 10);
});

test('weight unit misread as 9 ("8.45 9") is not accepted as grams', async () => {
  const { parseInvoice } = await load();
  const p = parseInvoice('Item: Ring 21K\nWeight: 8.45 9\nTotal: 31,250 EGP', { today });
  assert.equal(p.grams.value, null); assert.equal(p.grams.status, 'missing');
  assert.equal(p.karat.value, 21); assert.equal(p.paid.value, 31250);
});

test('unlabeled amounts are never used as the paid price; making charge is not the total', async () => {
  const { parseInvoice } = await load();
  assert.equal(parseInvoice('600 جنيه\n21,480 جنيه').paid.status, 'missing');
  assert.equal(parseInvoice('المصنعية: 600 جنيه').paid.value, null);
  const two = parseInvoice('الإجمالي: 21,480\nالإجمالي: 21,840');
  assert.equal(two.paid.status, 'check'); assert.equal(two.paid.value, null); assert.deepEqual(two.paid.candidates, [21480, 21840]);
});

test('ambiguous day/month, future dates and hijri years are not filled', async () => {
  const { parseInvoice } = await load();
  const amb = parseInvoice('03/04/2025', { today });
  assert.equal(amb.purchaseDate.value, null); assert.deepEqual(amb.purchaseDate.candidates, ['2025-04-03', '2025-03-04']);
  assert.equal(parseInvoice('14/03/2025', { today }).purchaseDate.value, '2025-03-14');
  assert.equal(parseInvoice('01/01/2027', { today }).purchaseDate.value, null);
  assert.equal(parseInvoice('14/03/1446', { today }).purchaseDate.value, null);
  assert.equal(parseInvoice('2025-11-02', { today }).purchaseDate.value, '2025-11-02');
});

test('conflicting or unusual karat/weight stay empty', async () => {
  const { parseInvoice } = await load();
  assert.equal(parseInvoice('عيار 21\nعيار 18').karat.value, null);
  assert.equal(parseInvoice('عيار 20').karat.value, null);
  assert.equal(parseInvoice('5.10 جم\n8.45 جم').grams.value, null);
  assert.equal(parseInvoice('3,500 جم').grams.value, null);
  assert.equal(parseInvoice('8,45 جم').grams.value, 8.45);
  assert.equal(parseInvoice('5000 جم').grams.value, null);
});

test('every field always requires owner confirmation and nothing here can save', async () => {
  const M = await load();
  const p = M.parseInvoice('عيار 21\n8.45 جم\n14/03/2025\nالإجمالي: 31,250', { today });
  for (const k of ['karat', 'grams', 'purchaseDate', 'paid']) assert.equal(p[k].confirm, true);
  assert.deepEqual(Object.keys(M).sort(), ['MIN_DIGIT_CONFIDENCE', 'UNSUPPORTED_DIGITS', 'normalizeDigits', 'parseInvoice', 'prefill']);
});
