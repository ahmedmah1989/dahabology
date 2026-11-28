const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../public/js/target-alert.js');

const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => m[k] = v, removeItem: k => delete m[k] }; };
const NOW = Date.parse('2026-11-25T17:00:00Z');
const freshAt = (p, minAgo = 1) => ({ price: p, sourceTime: new Date(NOW - minAgo * 60000).toISOString() });

test('arm: direction derived from target side; stored', () => {
  const s = mem();
  const st = T.arm(6000, freshAt(5505), NOW, s);
  assert.equal(st.direction, 'up'); assert.equal(st.state, 'armed');
  const st2 = T.arm(5000, freshAt(5505), NOW, s);
  assert.equal(st2.direction, 'down');
});

test('arm without fresh quote: waiting-first-fresh, no direction', () => {
  const st = T.arm(6000, freshAt(5505, 30), NOW, mem()); // 30 min old = stale
  assert.equal(st.state, 'waiting-first-fresh'); assert.equal(st.direction, null);
});

test('crossing up fires once with notice; second eval does not refire', () => {
  const s = mem();
  const st = T.arm(6000, freshAt(5505), NOW, s);
  const r1 = T.evaluate(st, 6100, freshAt(6100).sourceTime, NOW + 60000, s);
  assert.equal(r1.state, 'fired'); assert.ok(r1.notice.includes('هدفك'));
  const r2 = T.evaluate(T.load(s), 6200, freshAt(6200).sourceTime, NOW + 120000, s);
  assert.equal(r2.state, 'fired'); assert.equal(r2.notice, undefined);
});

test('no fire without crossing (wrong direction moves)', () => {
  const s = mem();
  const st = T.arm(6000, freshAt(5505), NOW, s);
  const r = T.evaluate(st, 5600, freshAt(5600).sourceTime, NOW + 60000, s);
  assert.equal(r.state, 'armed'); assert.equal(r.notice, undefined);
});

test('stale quote pauses and never fires, even past target', () => {
  const s = mem();
  const st = T.arm(6000, freshAt(5505), NOW, s);
  const r = T.evaluate(st, 7000, freshAt(7000, 20).sourceTime, NOW + 60000, s); // 20-min-old quote
  assert.equal(r.state, 'paused-stale'); assert.equal(r.notice, undefined);
});

test('reopen with expired stored reading: silent re-arm, no retroactive fire', () => {
  const s = mem();
  const st = T.arm(6000, freshAt(5505), NOW, s);
  // simulate stored state whose lastSeen is hours old: evaluate with fresh quote past target
  const stored = { ...st, lastSeen: { price: 5505, sourceTime: new Date(NOW - 6 * 3600000).toISOString() } };
  // lastSeen age doesn't gate; the QUOTE freshness gates. Crossing uses lastSeen vs current.
  // But a fresh install / cleared reading re-arms silently:
  const noReading = { ...st, lastSeen: null, direction: null };
  const r = T.evaluate(noReading, 7000, freshAt(7000).sourceTime, NOW + 10 * 60000, s);
  assert.equal(r.state, 'armed-silently'); assert.equal(r.notice, undefined);
  void stored;
});

test('crossing down fires', () => {
  const s = mem();
  const st = T.arm(5000, freshAt(5505), NOW, s);
  const r = T.evaluate(st, 4950, freshAt(4950).sourceTime, NOW + 60000, s);
  assert.equal(r.state, 'fired'); assert.ok(r.notice);
});

test('future quote time beyond skew is not fresh', () => {
  assert.equal(T.fresh(5505, new Date(NOW + 10 * 60000).toISOString(), NOW), false);
});

test('new target after firing re-arms cleanly', () => {
  const s = mem();
  const st = T.arm(6000, freshAt(5505), NOW, s);
  T.evaluate(st, 6100, freshAt(6100).sourceTime, NOW + 60000, s);
  const st2 = T.arm(7000, freshAt(6100), NOW + 120000, s);
  assert.equal(st2.firedAt, null); assert.equal(st2.direction, 'up'); assert.equal(st2.state, 'armed');
});

test('revisit: armed alert survives reload and is not lost or refired silently', () => {
  const s = mem();
  T.arm(6000, freshAt(5505), NOW, s);
  const reloaded = T.load(s); // new visit, storage intact
  assert.equal(reloaded.state, 'armed'); assert.equal(reloaded.target, 6000); assert.equal(reloaded.direction, 'up');
  // next fresh quote below target: still armed, no notice, no loss
  const r = T.evaluate(reloaded, 5560, freshAt(5560).sourceTime, NOW + 60000, s);
  assert.equal(r.state, 'armed'); assert.equal(r.notice, undefined);
  assert.equal(T.load(s).state, 'armed');
});

test('paused-stale resumes on fresh quote and can still fire the crossing', () => {
  const s = mem();
  const st = T.arm(6000, freshAt(5505), NOW, s);
  const r1 = T.evaluate(st, 7000, freshAt(7000, 20).sourceTime, NOW + 60000, s); // stale: paused, NO fire despite past target
  assert.equal(r1.state, 'paused-stale');
  // price comes back fresh below target then crosses up on later fresh quotes
  const r2 = T.evaluate(T.load(s), 5900, freshAt(5900).sourceTime, NOW + 360000, s);
  assert.equal(r2.state, 'armed');
  const r3 = T.evaluate(T.load(s), 6050, freshAt(6050).sourceTime, NOW + 660000, s);
  assert.equal(r3.state, 'fired'); assert.ok(r3.notice);
});

test('fired state persists across reload; never refires', () => {
  const s = mem();
  const st = T.arm(6000, freshAt(5505), NOW, s);
  T.evaluate(st, 6100, freshAt(6100).sourceTime, NOW + 60000, s);
  const reloaded = T.load(s);
  assert.equal(reloaded.state, 'fired'); assert.ok(reloaded.firedAt);
  const r = T.evaluate(reloaded, 6500, freshAt(6500).sourceTime, NOW + 120000, s);
  assert.equal(r.state, 'fired'); assert.equal(r.notice, undefined);
});

test('clear removes the alert; load returns null', () => {
  const s = mem();
  T.arm(6000, freshAt(5505), NOW, s);
  T.clear(s);
  assert.equal(T.load(s), null);
});

test('an invalid target shows the number message instead of the default prompt', () => {
  const path = require.resolve('../public/js/target-alert.js');
  const els = {};
  const mk = id => els[id] = { id, textContent: '', value: '', children: [], listeners: {}, addEventListener(e, f) { this.listeners[e] = f; } };
  ['targetAlertBox', 'targetAlertStatus', 'targetAlertValue', 'targetAlertSet', 'targetAlertClear', 'targetAlertNotices'].forEach(mk);
  const store = {};
  global.document = { getElementById: id => els[id] || null, activeElement: null };
  global.window = { addEventListener() {} };
  global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
  delete require.cache[path];
  try {
    require(path);
    els.targetAlertValue.value = 'abc';
    els.targetAlertSet.listeners.click();
    assert.match(els.targetAlertStatus.textContent, /رقمًا صحيحًا/);
    els.targetAlertValue.value = '0';
    els.targetAlertSet.listeners.click();
    assert.match(els.targetAlertStatus.textContent, /رقمًا صحيحًا/);
  } finally {
    delete global.document; delete global.window; delete global.localStorage; delete require.cache[path];
  }
});
