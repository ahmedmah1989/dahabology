const test = require('node:test');
const assert = require('node:assert/strict');
const { metrics, gramsText } = require('../public/js/comparison.js');

test('comparison never shows a positive weight as zero grams', () => {
  assert.equal(gramsText(0.0001), 'أقل من 0.001 جرام');
  assert.equal(gramsText(0.00049), 'أقل من 0.001 جرام');
  assert.equal(gramsText(0.0005), '0.001 جرام');
  assert.equal(gramsText(10), '10 جرام');
  assert.equal(gramsText(8.125), '8.125 جرام');
  assert.equal(gramsText(0), '0 جرام');
  assert.equal(gramsText(NaN), '—');
  const m = metrics({ weight: 0.0001, karat: 18, total: 1 });
  assert.equal(gramsText(m.pure), 'أقل من 0.001 جرام'); // pure weight is also tiny, still not zero
});
