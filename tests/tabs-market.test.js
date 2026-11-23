const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const SRC = fs.readFileSync(require.resolve('../public/js/tabs-market.js'), 'utf8');

function setup(hash = '') {
  const listeners = {};
  const mkTab = name => ({
    attrs: { 'data-pane': name, 'aria-selected': name === 'market' ? 'true' : 'false' },
    tabIndex: name === 'market' ? 0 : -1,
    focused: false,
    handlers: {},
    getAttribute(k) { return this.attrs[k]; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, f) { (this.handlers[k] = this.handlers[k] || []).push(f); },
    click() { (this.handlers.click || []).forEach(f => f()); },
    key(k) { (this.handlers.keydown || []).forEach(f => f({ key: k, preventDefault() { this.prevented = true; } })); },
    focus() { this.focused = true; }
  });
  const tabs = [mkTab('market'), mkTab('analysis'), mkTab('live')];
  const panes = {};
  ['market', 'analysis', 'live'].forEach(n => { panes['pane-' + n] = { hidden: n !== 'market' }; });
  const h1 = { textContent: 'سعر الذهب الآن' };
  const scriptsAppended = [];
  const scrollCalls = [];
  const rafQueue = [];
  const context = {
    document: {
      querySelectorAll: s => (s.includes('role="tab"') ? tabs : []),
      getElementById: id => panes[id] || null,
      querySelector: s => s === '.x-top h1' ? h1 : s === '.market-tabs' ? { scrollIntoView() { scrollCalls.push(1); } } : s.startsWith('script') ? { src: '/js/quote-state.js?v=TESTV' } : null,
      createElement: () => ({ src: '', onload: null }),
      head: { append(el) { scriptsAppended.push(el.src); if (el.onload) setTimeout(() => el.onload(), 0); } },
      title: ''
    },
    window: {
      addEventListener(k, f) { (listeners[k] = listeners[k] || []).push(f); },
      DHB_BASE: '/',
      DHB_BOARD: { detail: () => ({ sources: { mock: true } }) },
      _events: [],
      dispatchEvent(e) { this._events.push(e); }
    },
    location: { hash },
    history: { replaceState(u, t, h) { context.location.hash = h; } },
    CustomEvent: function (n, o) { return { type: n, detail: o && o.detail }; },
    requestAnimationFrame: f => { rafQueue.push(f); },
    setTimeout, clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(SRC, context);
  return { tabs, panes, h1, scriptsAppended, context, listeners, scrollCalls, rafQueue };
}
const tick = () => new Promise(r => setTimeout(r, 10));

test('default load keeps the market pane and does not load the analysis bundle', () => {
  const s = setup();
  assert.equal(s.panes['pane-market'].hidden, false);
  assert.equal(s.panes['pane-analysis'].hidden, true);
  assert.equal(s.panes['pane-live'].hidden, true);
  assert.deepEqual(s.scriptsAppended, []);
});

test('clicking التحليل switches panes, sets state, hash and titles, lazy-loads once', async () => {
  const s = setup();
  s.tabs[1].click();
  assert.equal(s.panes['pane-analysis'].hidden, false);
  assert.equal(s.panes['pane-market'].hidden, true);
  assert.equal(s.panes['pane-live'].hidden, true);
  assert.equal(s.tabs[1].attrs['aria-selected'], 'true');
  assert.equal(s.tabs[0].attrs['aria-selected'], 'false');
  assert.equal(s.tabs[1].tabIndex, 0);
  assert.equal(s.tabs[0].tabIndex, -1);
  assert.equal(s.context.location.hash, '#analysis');
  assert.equal(s.h1.textContent, 'تحليل الذهب');
  assert.match(s.context.document.title, /تحليل الذهب/);
  assert.deepEqual(s.scriptsAppended, ['/js/analytics.js?v=TESTV']);
  await tick();
  assert.deepEqual(s.scriptsAppended, ['/js/analytics.js?v=TESTV', '/js/ui.js?v=TESTV']);
  const replayed = s.context.window._events.filter(e => e.type === 'gold-board-updated');
  assert.equal(replayed.length, 1);
  assert.deepEqual(replayed[0].detail, { sources: { mock: true } });
  s.tabs[1].click();
  await tick();
  assert.equal(s.scriptsAppended.length, 2, 'no duplicate lazy load');
});

test('clicking الرسم الحي re-renders the live chart and updates identity', () => {
  const s = setup();
  let renders = 0;
  s.context.window.DHB_LIVE_RENDER = () => { renders++; };
  s.tabs[2].click();
  assert.equal(renders, 1);
  assert.equal(s.panes['pane-live'].hidden, false);
  assert.equal(s.panes['pane-market'].hidden, true);
  assert.equal(s.context.location.hash, '#live');
  assert.equal(s.h1.textContent, 'الرسم الحي');
  assert.match(s.context.document.title, /XAUUSD/);
});

test('returning to السوق restores its identity', () => {
  const s = setup('#live');
  assert.equal(s.panes['pane-live'].hidden, false);
  s.tabs[0].click();
  assert.equal(s.panes['pane-market'].hidden, false);
  assert.equal(s.h1.textContent, 'سعر الذهب الآن');
  assert.match(s.context.document.title, /سعر الذهب اليوم/);
});

test('deep link hash opens the right pane at load, unknown hash ignored', () => {
  const a = setup('#analysis');
  assert.equal(a.panes['pane-analysis'].hidden, false);
  assert.deepEqual(a.scriptsAppended, ['/js/analytics.js?v=TESTV']);
  const b = setup('#nonsense');
  assert.equal(b.panes['pane-market'].hidden, false);
  assert.deepEqual(b.scriptsAppended, []);
});

test('RTL keyboard: left arrow moves to next tab with focus, End jumps to last', () => {
  const s = setup();
  s.tabs[0].key('ArrowLeft');
  assert.equal(s.panes['pane-analysis'].hidden, false);
  assert.equal(s.tabs[1].focused, true);
  s.tabs[1].key('End');
  assert.equal(s.panes['pane-live'].hidden, false);
  assert.equal(s.tabs[2].focused, true);
  s.tabs[2].key('ArrowRight');
  assert.equal(s.panes['pane-analysis'].hidden, false, 'right arrow wraps back');
});

test('hashchange switches panes and re-asserts the tab strip after the smooth scroll settles', async () => {
  const s = setup();
  assert.ok(Array.isArray(s.listeners.hashchange) && s.listeners.hashchange.length === 1);
  const fireHash = () => s.listeners.hashchange.forEach(f => f());
  s.context.location.hash = '#live';
  fireHash();
  assert.equal(s.panes['pane-live'].hidden, false);
  assert.equal(s.rafQueue.length, 1, 'immediate re-assert queued');
  s.rafQueue.forEach(f => f());
  await new Promise(r => setTimeout(r, 750));
  assert.ok(s.scrollCalls.length >= 2, 'strip re-asserted after the settle delay: ' + s.scrollCalls.length);
  s.context.location.hash = '#market';
  fireHash();
  assert.equal(s.panes['pane-market'].hidden, false);
  s.context.location.hash = '#nonsense';
  s.rafQueue.length = 0;
  fireHash();
  assert.equal(s.rafQueue.length, 0, 'unknown hash triggers no re-assert');
});

test('user takeover cancels a pending settle re-assert (hashchange, tab click, scroll input)', async () => {
  const s = setup();
  const fireHash = () => s.listeners.hashchange.forEach(f => f());
  /* 1: a later hashchange (incl. cleared hash) supersedes the pending timer */
  s.context.location.hash = '#analysis';
  fireHash();
  s.rafQueue.forEach(f => f());
  s.context.location.hash = '';       /* user clears the hash */
  fireHash();
  let n = s.scrollCalls.length;
  await new Promise(r => setTimeout(r, 750));
  assert.equal(s.scrollCalls.length, n, 'cleared hash cancelled the pending re-assert');
  /* 2: explicit tab click cancels */
  s.context.location.hash = '#analysis';
  fireHash();
  s.rafQueue.forEach(f => f());
  s.tabs[0].click();
  n = s.scrollCalls.length;
  await new Promise(r => setTimeout(r, 750));
  assert.equal(s.scrollCalls.length, n, 'tab click cancelled the pending re-assert');
  /* 3: deliberate scroll input cancels (wheel, touchstart, scroll keys) */
  for (const fire of [
    () => s.listeners.wheel.forEach(f => f()),
    () => s.listeners.touchstart.forEach(f => f()),
    () => s.listeners.keydown.forEach(f => f({ key: 'ArrowDown' }))
  ]) {
    s.context.location.hash = '#live';
    fireHash();
    s.rafQueue.forEach(f => f());
    fire();
    n = s.scrollCalls.length;
    await new Promise(r => setTimeout(r, 750));
    assert.equal(s.scrollCalls.length, n, 'scroll input cancelled the pending re-assert');
  }
  /* 4: non-scroll keys do NOT cancel (typing in a field is not scroll intent) */
  s.context.location.hash = '#analysis';
  fireHash();
  s.rafQueue.forEach(f => f());
  s.listeners.keydown.forEach(f => f({ key: 'a' }));
  await new Promise(r => setTimeout(r, 750));
  assert.ok(s.scrollCalls.length > 0, 'letter key left the re-assert alone');
});
