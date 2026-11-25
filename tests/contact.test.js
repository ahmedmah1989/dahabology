const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/contact.js');

test('validate: empty and whitespace rejected; over-limit rejected; trimmed pass', () => {
  assert.equal(C.validate('').ok, false);
  assert.equal(C.validate('   ').ok, false);
  assert.equal(C.validate('x'.repeat(C.MAX_LEN + 1)).reason, 'too-long');
  const v = C.validate('  سعر عيار 21 فيه غلطة  ');
  assert.equal(v.ok, true); assert.equal(v.message, 'سعر عيار 21 فيه غلطة');
});

test('msgId: unique-ish, prefixed', () => {
  const a = C.msgId(), b = C.msgId();
  assert.match(a, /^m-/); assert.notEqual(a, b);
});

test('classifyAck: wrong origin ignored, wrong id ignored, ok maps to sent, failure maps to failed', () => {
  const REAL = 'https://n-fiwdyhgqgvtmfwid6yxiaijpei5k43sfclqcu2a-0lu-script.googleusercontent.com'; // observed per-deployment sandbox origin
  assert.equal(C.classifyAck({ id: 'm-1', ok: true }, 'm-1', 'https://evil.example'), 'ignore');
  assert.equal(C.classifyAck({ id: 'm-1', ok: true }, 'm-1', 'https://script.googleusercontent.com.evil.example'), 'ignore');
  assert.equal(C.classifyAck({ id: 'm-2', ok: true }, 'm-1', REAL), 'ignore');
  assert.equal(C.classifyAck({ id: 'm-1', ok: true }, 'm-1', REAL), 'sent');
  assert.equal(C.classifyAck({ id: 'm-1', ok: false }, 'm-1', REAL), 'failed');
  assert.equal(C.classifyAck({ id: 'm-1', ok: false, reason: 'login-required' }, 'm-1', REAL), 'login-required');
  assert.equal(C.classifyAck({ id: 'm-1', ok: false, reason: 'cap' }, 'm-1', REAL), 'failed');
});

test('unconfigured by default: ENDPOINT and MAILTO empty, configured() false', () => {
  assert.equal(C.CONFIG.ENDPOINT, '');
  assert.equal(C.CONFIG.MAILTO, '');
  assert.equal(C.configured(), false);
});
