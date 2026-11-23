const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const SRC = fs.readFileSync(require.resolve('../public/js/tabs-calc.js'), 'utf8');

function setup(hash = '') {
  const listeners = {};
  const byId = {};
  const mkTab = name => ({
    attrs: { 'data-pane': name, 'aria-selected': name === 'calculator' ? 'true' : 'false' },
    tabIndex: name === 'calculator' ? 0 : -1,
    focused: false,
    handlers: {},
    getAttribute(k) { return this.attrs[k]; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, f) { (this.handlers[k] = this.handlers[k] || []).push(f); },
    click() { (this.handlers.click || []).forEach(f => f()); },
    key(k) { (this.handlers.keydown || []).forEach(f => f({ key: k, preventDefault() { this.prevented = true; } })); },
    focus() { this.focused = true; }
  });
  const tabs = [mkTab('calculator'), mkTab('invoice')];
  const mkPane = n => ({
    hidden: n !== 'calculator',
    children: [],
    get firstChild() { return this.children[0] || null; },
    insertBefore(el) { this.children.unshift(el); if (el.id) byId[el.id] = el; }
  });
  const panes = { 'pane-calculator': mkPane('calculator'), 'pane-invoice': mkPane('invoice') };
  const h1 = { textContent: 'الحاسبة' };
  const scriptsAppended = [];
  const scrollCalls = [];
  const rafQueue = [];
  const mkEl = () => ({
    id: '', className: '', textContent: '', hidden: false, type: '',
    style: {},
    children: [],
    handlers: {},
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...kids) { kids.forEach(k => { this.children.push(k); if (k && k.id) byId[k.id] = k; }); },
    addEventListener(k, f) { (this.handlers[k] = this.handlers[k] || []).push(f); },
    click() { (this.handlers.click || []).forEach(f => f()); }
  });
  const context = {
    document: {
      readyState: 'complete',
      querySelectorAll: s => (s.includes('role="tab"') ? tabs : []),
      getElementById: id => panes[id] || byId[id] || null,
      querySelector: s => s === '.x-top h1' ? h1
        : s === '.market-tabs' ? { scrollIntoView(o) { scrollCalls.push(o); } }
        : s.startsWith('script') ? { src: '/js/quote-state.js?v=TESTV' } : null,
      createElement: tag => tag === 'script' ? { src: '', onload: null, onerror: null } : mkEl(),
      createTextNode: t => ({ text: t }),
      head: { append(el) { scriptsAppended.push(el); } },
      title: ''
    },
    window: {
      addEventListener(k, f) { listeners[k] = f; },
      DHB_BASE: '/',
      _events: [],
      dispatchEvent(e) { this._events.push(e); }
    },
    location: { hash },
    history: { replaceState(u, t, h) { context.location.hash = h; } },
    CustomEvent: function (n, o) { return { type: n, detail: o && o.detail }; },
    requestAnimationFrame: f => { rafQueue.push(f); },
    setTimeout
  };
  vm.createContext(context);
  vm.runInContext(SRC, context);
  return { tabs, panes, h1, scriptsAppended, scrollCalls, rafQueue, context, listeners, byId };
}
const flushLoad = s => { const sc = s.scriptsAppended[s.scriptsAppended.length - 1]; if (sc && sc.onload) sc.onload(); };
const flushError = s => { const sc = s.scriptsAppended[s.scriptsAppended.length - 1]; if (sc && sc.onerror) sc.onerror(); };

test('default load keeps the calculator pane and does not load the tools bundle', () => {
  const s = setup();
  assert.equal(s.panes['pane-calculator'].hidden, false);
  assert.equal(s.panes['pane-invoice'].hidden, true);
  assert.deepEqual(s.scriptsAppended.map(x => x.src), []);
  assert.equal(s.byId.invoiceLoadNote, undefined);
});

test('clicking افحص الفاتورة switches panes, sets state, hash and titles, lazy-loads tools.js once', () => {
  const s = setup();
  s.context.window.dispatchEvent({ type: 'gold-board-updated', detail: { sources: { mock: true } } });
  s.tabs[1].click();
  assert.equal(s.panes['pane-invoice'].hidden, false);
  assert.equal(s.panes['pane-calculator'].hidden, true);
  assert.equal(s.tabs[1].attrs['aria-selected'], 'true');
  assert.equal(s.tabs[0].attrs['aria-selected'], 'false');
  assert.equal(s.tabs[1].tabIndex, 0);
  assert.equal(s.tabs[0].tabIndex, -1);
  assert.equal(s.context.location.hash, '#invoice');
  assert.equal(s.h1.textContent, 'افحص الفاتورة');
  assert.match(s.context.document.title, /افحص فاتورة الذهب/);
  assert.deepEqual(s.scriptsAppended.map(x => x.src), ['/js/tools.js?v=TESTV']);
  flushLoad(s);
  /* last quote replayed into the freshly loaded tools.js */
  const replayed = s.context.window._events.filter(e => e.type === 'gold-board-updated');
  assert.equal(replayed.length, 1);
  assert.deepEqual(replayed[0].detail, { sources: { mock: true } });
  s.tabs[1].click();
  assert.equal(s.scriptsAppended.length, 1, 'no duplicate lazy load');
});

test('returning to الحاسبة restores its identity', () => {
  const s = setup('#invoice');
  assert.equal(s.panes['pane-invoice'].hidden, false);
  s.tabs[0].click();
  assert.equal(s.panes['pane-calculator'].hidden, false);
  assert.equal(s.panes['pane-invoice'].hidden, true);
  assert.equal(s.h1.textContent, 'الحاسبة');
  assert.match(s.context.document.title, /حاسبة الذهب/);
  assert.equal(s.context.location.hash, '#calculator');
});

test('deep link #invoice opens the invoice pane at load and re-asserts the tab strip', () => {
  const s = setup('#invoice');
  assert.equal(s.panes['pane-invoice'].hidden, false);
  assert.deepEqual(s.scriptsAppended.map(x => x.src), ['/js/tools.js?v=TESTV']);
  assert.equal(s.scrollCalls.length, 1, 'instant reveal at boot');
  assert.equal(s.rafQueue.length, 1, 're-assert queued after load settles');
  s.rafQueue.forEach(f => f());
  assert.equal(s.scrollCalls.length, 2);
  const b = setup('#nonsense');
  assert.equal(b.panes['pane-calculator'].hidden, false);
  assert.deepEqual(b.scriptsAppended, []);
  assert.equal(b.scrollCalls.length, 0);
});

test('RTL keyboard: left arrow moves to next tab with focus, End jumps to last', () => {
  const s = setup();
  s.tabs[0].key('ArrowLeft');
  assert.equal(s.panes['pane-invoice'].hidden, false);
  assert.equal(s.tabs[1].focused, true);
  assert.equal(s.context.location.hash, '#invoice');
  s.tabs[1].key('End');
  assert.equal(s.panes['pane-invoice'].hidden, false);
  assert.equal(s.tabs[1].focused, true);
  s.tabs[1].key('ArrowRight');
  assert.equal(s.panes['pane-calculator'].hidden, false, 'right arrow wraps back');
  assert.equal(s.tabs[0].focused, true);
});

test('hashchange switches panes', () => {
  const s = setup();
  assert.equal(typeof s.listeners.hashchange, 'function');
  s.context.location.hash = '#invoice';
  s.listeners.hashchange();
  assert.equal(s.panes['pane-invoice'].hidden, false);
  s.context.location.hash = '#calculator';
  s.listeners.hashchange();
  assert.equal(s.panes['pane-calculator'].hidden, false);
});

test('offline first activation: error shows honest note with retry, retry reloads, success hides note', () => {
  const s = setup();
  s.tabs[1].click();
  flushError(s);
  const note = s.byId.invoiceLoadNote;
  assert.ok(note, 'note created');
  assert.equal(note.hidden, false);
  assert.equal(note.attrs.role, 'status');
  assert.match(note.children[0].text, /تعذّر تحميل فحص الفاتورة/);
  const retry = note.children.find(c => c.id === 'invoiceRetry');
  assert.ok(retry, 'retry button present');
  assert.equal(s.scriptsAppended.length, 1);
  retry.click();
  assert.equal(note.hidden, true, 'note hidden while retrying');
  assert.equal(s.scriptsAppended.length, 2, 'tools.js re-requested');
  flushLoad(s);
  assert.equal(note.hidden, true, 'note stays hidden after success');
  s.tabs[0].click();
  s.tabs[1].click();
  assert.equal(s.scriptsAppended.length, 2, 'no reload after success');
});

test('online event self-heals an open invoice tab whose bundle failed', () => {
  const s = setup();
  s.tabs[1].click();
  flushError(s);
  assert.equal(s.scriptsAppended.length, 1);
  assert.equal(typeof s.listeners.online, 'function');
  s.listeners.online();
  assert.equal(s.scriptsAppended.length, 2, 'retry attempted on reconnect');
});

test('online event does nothing when the invoice tab is not open', () => {
  const s = setup();
  assert.equal(typeof s.listeners.online, 'function');
  s.listeners.online();
  assert.deepEqual(s.scriptsAppended, []);
});
