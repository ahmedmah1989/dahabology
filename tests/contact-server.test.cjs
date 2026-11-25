/* Mocked-GAS harness for deploy/contact/Code.gs: verifies the strict registered-sender rules
   WITHOUT touching the real endpoint (no email quota consumed, no network).
   Every negative path must refuse with 'login-required' (or its honest reason), consume no daily
   slot, and never leak the token into the ack, the email, or any URL. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'contact', 'Code.gs'), 'utf8');
const DAY = '2026-11-25';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeToken(claims) {
  return b64url({ alg: 'RS256' }) + '.' + b64url(claims) + '.fakesig';
}
const GOOD_CLAIMS = { aud: 'dahabology-59961', iss: 'https://securetoken.google.com/dahabology-59961', sub: 'uid1' };

function makeWorld({ lookupCode = 200, lookupBody = null, destination = 'dest@example.com', capUsed = 0, fetchThrows = false, mailThrows = false } = {}) {
  const store = {
    contact_daily: JSON.stringify({ day: DAY, used: capUsed }),
    ...(destination === null ? {} : { contact_destination: destination })
  };
  const calls = { fetch: [], mail: [], lookupUrls: [] };
  const Utilities = {
    formatDate: () => DAY,
    base64DecodeWebSafe: (s) => Array.from(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') })
  };
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = v; }
  }) };
  const LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
  const MailApp = { sendEmail: (arg) => { if (mailThrows) throw new Error('quota'); calls.mail.push(arg); } };
  const UrlFetchApp = { fetch: (url, opts) => {
    if (fetchThrows) throw new Error('network down');
    calls.fetch.push({ url, opts });
    return {
      getResponseCode: () => lookupCode,
      getContentText: () => JSON.stringify(lookupBody === null ? { users: [{ email: 'visitor@example.com', emailVerified: true, localId: 'uid1' }] } : lookupBody)
    };
  } };
  const HtmlService = {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: (html) => ({ _html: html, setXFrameOptionsMode(m) { this._xfo = m; return this; }, getContent() { return this._html; } })
  };
  const ContentService = { createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }), MimeType: { JSON: 'JSON' } };
  const sandbox = new Function('Utilities', 'PropertiesService', 'LockService', 'MailApp', 'UrlFetchApp', 'HtmlService', 'ContentService',
    SRC + '\nreturn { doPost, doGet, CONFIG };');
  const gs = sandbox(Utilities, PropertiesService, LockService, MailApp, UrlFetchApp, HtmlService, ContentService);
  return { gs, calls, store };
}
function post(gs, fields) {
  const body = Object.entries(fields).map(([k, v]) => k + '=' + v).join('\n');
  const out = gs.doPost({ postData: { contents: body } });
  const m = /var p=(\{.*?\});/s.exec(out.getContent());
  assert.ok(m, 'ack payload present in reply page');
  return JSON.parse(m[1]);
}
const usedToday = (store) => JSON.parse(store.contact_daily).used;

test('missing token: refused login-required, no lookup, no slot, no email', () => {
  const { gs, calls, store } = makeWorld();
  const ack = post(gs, { id: 'm-a', message: 'مرحبا' });
  assert.equal(ack.ok, false); assert.equal(ack.reason, 'login-required');
  assert.equal(calls.fetch.length, 0); assert.equal(calls.mail.length, 0); assert.equal(usedToday(store), 0);
});

test('malformed token: refused before any network call', () => {
  const { gs, calls, store } = makeWorld();
  const ack = post(gs, { id: 'm-b', message: 'مرحبا', token: 'not-a-jwt' });
  assert.equal(ack.reason, 'login-required');
  assert.equal(calls.fetch.length, 0); assert.equal(usedToday(store), 0);
});

test('wrong-project token (aud/iss mismatch): refused before any network call', () => {
  const { gs, calls, store } = makeWorld();
  const bad1 = makeToken({ aud: 'other-project', iss: 'https://securetoken.google.com/other-project' });
  const bad2 = makeToken({ aud: 'dahabology-59961', iss: 'https://securetoken.google.com/other-project' });
  for (const token of [bad1, bad2]) {
    const ack = post(gs, { id: 'm-c', message: 'مرحبا', token });
    assert.equal(ack.reason, 'login-required');
  }
  assert.equal(calls.fetch.length, 0); assert.equal(calls.mail.length, 0); assert.equal(usedToday(store), 0);
});

test('invalid/expired token (Google lookup rejects): refused, no slot, no email', () => {
  for (const body of [{ error: { message: 'INVALID_ID_TOKEN' } }, { error: { message: 'TOKEN_EXPIRED' } }, {}]) {
    const { gs, calls, store } = makeWorld({ lookupCode: 400, lookupBody: body });
    const ack = post(gs, { id: 'm-d', message: 'مرحبا', token: makeToken(GOOD_CLAIMS) });
    assert.equal(ack.reason, 'login-required');
    assert.equal(calls.mail.length, 0); assert.equal(usedToday(store), 0);
  }
});

test('registered but UNVERIFIED email: refused, no slot, no email', () => {
  const { gs, calls, store } = makeWorld({ lookupBody: { users: [{ email: 'visitor@example.com', emailVerified: false }] } });
  const ack = post(gs, { id: 'm-e', message: 'مرحبا', token: makeToken(GOOD_CLAIMS) });
  assert.equal(ack.reason, 'login-required');
  assert.equal(calls.mail.length, 0); assert.equal(usedToday(store), 0);
});

test('verification service unreachable: refuses (never trusts the token)', () => {
  const { gs, calls, store } = makeWorld({ fetchThrows: true });
  const ack = post(gs, { id: 'm-f', message: 'مرحبا', token: makeToken(GOOD_CLAIMS) });
  assert.equal(ack.reason, 'login-required');
  assert.equal(calls.mail.length, 0); assert.equal(usedToday(store), 0);
});

test('verified registered sender: sends with replyTo = server-derived email; token never leaks', () => {
  const { gs, calls, store } = makeWorld();
  const token = makeToken(GOOD_CLAIMS);
  const ack = post(gs, { id: 'm-g', message: 'السعر فيه غلطة', token });
  assert.equal(ack.ok, true);
  assert.equal(calls.mail.length, 1);
  const mail = calls.mail[0];
  assert.equal(mail.to, 'dest@example.com');
  assert.equal(mail.replyTo, 'visitor@example.com');
  assert.match(mail.body, /visitor@example\.com/);
  assert.ok(!mail.body.includes(token) && !mail.subject.includes(token), 'token not in email');
  assert.ok(!JSON.stringify(ack).includes(token), 'token not in ack');
  for (const c of calls.fetch) assert.ok(!c.url.includes(token), 'token not in URL');
  assert.equal(usedToday(store), 1); // slot consumed only after verification
});

test('client-claimed reply field is ignored: sender identity comes only from the verified token', () => {
  const { gs, calls } = makeWorld();
  post(gs, { id: 'm-h', message: 'مرحبا', token: makeToken(GOOD_CLAIMS), reply: 'attacker@evil.example' });
  const mail = calls.mail[0];
  assert.equal(mail.replyTo, 'visitor@example.com');
  assert.ok(!mail.body.includes('attacker@evil.example'));
});

test('cap consumed only by verified sends; exhausted cap refuses AFTER verification', () => {
  const { gs, calls, store } = makeWorld({ capUsed: 10 });
  const ack = post(gs, { id: 'm-i', message: 'مرحبا', token: makeToken(GOOD_CLAIMS) });
  assert.equal(ack.reason, 'cap');
  assert.equal(calls.mail.length, 0); assert.equal(usedToday(store), 10);
});

test('destination unset: fail closed unconfigured even with a valid token', () => {
  const { gs, calls, store } = makeWorld({ destination: null });
  const ack = post(gs, { id: 'm-j', message: 'مرحبا', token: makeToken(GOOD_CLAIMS) });
  assert.equal(ack.reason, 'unconfigured');
  assert.equal(calls.mail.length, 0); assert.equal(usedToday(store), 0);
});

test('honeypot: pretend-accept, no lookup, no slot, no email', () => {
  const { gs, calls, store } = makeWorld();
  const ack = post(gs, { id: 'm-k', message: 'x', website: 'http://spam' });
  assert.equal(ack.ok, true);
  assert.equal(calls.fetch.length, 0); assert.equal(calls.mail.length, 0); assert.equal(usedToday(store), 0);
});

test('empty and over-limit messages refused before verification', () => {
  const { gs, calls, store } = makeWorld();
  assert.equal(post(gs, { id: 'm-l', message: '  ', token: makeToken(GOOD_CLAIMS) }).reason, 'empty');
  assert.equal(post(gs, { id: 'm-m', message: 'x'.repeat(4001), token: makeToken(GOOD_CLAIMS) }).reason, 'too-long');
  assert.equal(calls.fetch.length, 0); assert.equal(usedToday(store), 0);
});

test('server code contains no destination address and no mailto', () => {
  assert.ok(!/mailto:/i.test(SRC));
  assert.ok(!/@gmail|@outlook|@yahoo|@hotmail/.test(SRC), 'no mailbox address hardcoded');
});
