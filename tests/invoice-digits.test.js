const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The typed-digit cleaner in invoice-form.js is DOM code, so the test pulls its converter out of the source and runs it.
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'invoice-form.js'), 'utf8');
const m = src.match(/const lat = s => [^\n]+;/);

test('invoice form converts Arabic and Persian digits before stripping non-digits', () => {
  assert.ok(m, 'converter exists in invoice-form.js');
  const lat = new Function(m[0] + '; return lat;')();
  const clean = s => lat(s).replace(/\D/g, '');
  assert.equal(clean('\u0666'), '6');
  assert.equal(clean('\u0662\u0668'), '28');
  assert.equal(clean('\u06f6\u06f2\u06f8'), '628');
  assert.equal(clean('\u0663'), '3');
  assert.equal(clean('6'), '6');
  assert.equal(clean('028'), '028');
  assert.equal(clean('abc'), '');
  assert.equal(clean('-5'), '5');
  assert.equal(clean(''), '');
});

test('quantity, whole grams and fraction all use the converter before stripping', () => {
  assert.match(src, /r\.qty = lat\(r\.qty\)\.replace\(\/\\D\/g, ''\)/);
  assert.match(src, /r\[f\] = lat\(r\[f\]\)\.replace\(\/\\D\/g, ''\)/);
});
