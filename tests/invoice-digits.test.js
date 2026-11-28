const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LG = require('../public/js/ledger-model.js');

// The weight boxes in invoice-form.js are DOM code, so the test reads the source and runs its converter.
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'invoice-form.js'), 'utf8');
const m = src.match(/const lat = s => [^\n]+;/);
const lat = new Function(m[0] + '; return lat;')();

test('Arabic and Persian digits are converted for quantity, grams and fraction', () => {
  assert.ok(m, 'converter exists in invoice-form.js');
  assert.equal(lat('\u0666'), '6');
  assert.equal(lat('\u0662\u0668'), '28');
  assert.equal(lat('\u06f6\u06f2\u06f8'), '628');
  assert.equal(lat('028'), '028');
  assert.match(src, /r\.qty = lat\(r\.qty\)\.replace\(\/\\D\/g, ''\)/);
});

test('whole-grams and fraction boxes keep raw text and carry no native length cut', () => {
  assert.match(src, /r\[f\] = lat\(r\[f\]\);/);
  assert.doesNotMatch(src, /r\[f\] = lat\(r\[f\]\)\.replace/);
  assert.doesNotMatch(src, /data-f="gw"[^>]*maxlength/);
  assert.doesNotMatch(src, /data-f="gf"[^>]*maxlength/);
});

test('a decimal typed in the whole box is an error, never a bigger weight', () => {
  for (const raw of ['6.28', '6,28', '6.5', '0.5', '12.345', '1,000', '1\u066c000', '6\u066b5', '-5', 'abc', '123456']) {
    assert.deepEqual(LG.composeWeight(lat(raw), ''), { error: 'format' }, raw);
  }
  assert.deepEqual(LG.composeWeight('6', '2800'), { error: 'format' });
  assert.deepEqual(LG.composeWeight('6', '5.5'), { error: 'format' });
});

test('valid weights stay exact', () => {
  assert.deepEqual(LG.composeWeight('6', '028'), { mg: 6028 });
  assert.deepEqual(LG.composeWeight('6', '28'), { mg: 6280 });
  assert.deepEqual(LG.composeWeight('0', '5'), { mg: 500 });
  assert.deepEqual(LG.composeWeight(lat('\u0666'), lat('\u0662\u0668')), { mg: 6280 });
  assert.deepEqual(LG.composeWeight('99999', '999'), { mg: 99999999 });
});

test('the error message names the two-box rule', () => {
  assert.match(src, /خانة الجرامات للأرقام الصحيحة بس/);
});
