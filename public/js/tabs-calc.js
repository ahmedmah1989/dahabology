/* Calculator page tabs: الحاسبة / افحص الفاتورة on one page.
   The old /invoice/ address redirects here with a hash; this script opens the right pane,
   lazy-loads tools.js (which carries the invoice check) only when its tab is first opened,
   and keeps h1/title honest. Same proven pattern as tabs-market.js, including the honest
   connection-needed state with retry when the lazy bundle cannot load. */
(function () {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('.market-tabs [role="tab"]'));
  if (!tabs.length || !document.getElementById('pane-calculator')) return;
  const panes = {}, META = {
    calculator: { h: 'الحاسبة', t: 'حاسبة الذهب: شراء وبيع بالمصنعية لعيار 24 و21 و18 — دهبولوجي' },
    invoice: { h: 'افحص الفاتورة', t: 'افحص فاتورة الذهب: كم دفعت مصنعية؟ — دهبولوجي' }
  };
  tabs.forEach(t => { panes[t.getAttribute('data-pane')] = document.getElementById('pane-' + t.getAttribute('data-pane')); });
  let toolsLoaded = false, toolsPending = false, lastDetail = null;
  /* Remember the monitor's latest quote so the invoice tab does not wait for the next cycle. */
  window.addEventListener('gold-board-updated', e => { lastDetail = e.detail; });
  function version() {
    const s = document.querySelector('script[src*="quote-state.js"]'), m = s && s.src.match(/[?&]v=([^&]+)/);
    return m ? '?v=' + m[1] : '';
  }
  /* Honest failure state: if the lazy bundle cannot load (offline first activation, new
     version not cached yet), say so and offer retry instead of leaving a silent shell. */
  function invoiceNote(show) {
    let n = document.getElementById('invoiceLoadNote');
    if (!n && show && panes.invoice) {
      n = document.createElement('p');
      n.id = 'invoiceLoadNote';
      n.className = 'x-note';
      n.setAttribute('role', 'status');
      n.append(document.createTextNode('تعذّر تحميل فحص الفاتورة الآن، غالبًا لانقطاع الاتصال. لن نعرض أرقامًا قديمة كأنها جديدة. '));
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'invoiceRetry'; b.textContent = 'إعادة المحاولة';
      b.style.cssText = 'margin-inline-start:8px;padding:6px 14px;border:1.5px solid #eac674;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer';
      b.addEventListener('click', () => { invoiceNote(false); loadInvoice(); });
      n.append(b);
      panes.invoice.insertBefore(n, panes.invoice.firstChild);
    }
    if (n) n.hidden = !show;
  }
  function loadInvoice() {
    if (toolsLoaded || toolsPending) return;
    toolsPending = true;
    const base = window.DHB_BASE || '/', v = version();
    const sc = document.createElement('script'); sc.src = base + 'js/tools.js' + v;
    sc.onload = () => {
      toolsLoaded = true; toolsPending = false; invoiceNote(false);
      /* tools.js registers its gold-board-updated listener at load; replay the last quote
         so the invoice price fills immediately instead of waiting for the next cycle. */
      if (lastDetail) window.dispatchEvent(new CustomEvent('gold-board-updated', { detail: lastDetail }));
    };
    sc.onerror = () => { toolsPending = false; invoiceNote(true); };
    document.head.append(sc);
  }
  window.addEventListener('online', () => { if (!toolsLoaded && panes.invoice && !panes.invoice.hidden) loadInvoice(); });
  function activate(name, focusTab) {
    if (!panes[name]) return;
    tabs.forEach(t => {
      const on = t.getAttribute('data-pane') === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focusTab) t.focus();
    });
    Object.keys(panes).forEach(k => { if (panes[k]) panes[k].hidden = k !== name; });
    const m = META[name];
    if (m) { const h = document.querySelector('.x-top h1'); if (h) h.textContent = m.h; document.title = m.t; }
    if (name === 'invoice') loadInvoice();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      const name = t.getAttribute('data-pane');
      activate(name);
      try { history.replaceState(null, '', '#' + name); } catch (_) {}
      const bar = document.querySelector('.market-tabs');
      if (bar && bar.scrollIntoView) bar.scrollIntoView({ block: 'start' });
    });
    t.addEventListener('keydown', e => {
      let j = null;
      if (e.key === 'ArrowLeft') j = (i + 1) % tabs.length;            /* RTL: left arrow moves to the next tab */
      else if (e.key === 'ArrowRight') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j === null) return;
      e.preventDefault();
      const name = tabs[j].getAttribute('data-pane');
      activate(name, true);
      try { history.replaceState(null, '', '#' + name); } catch (_) {}
    });
  });
  function fromHash() { const n = (location.hash || '').slice(1); if (panes[n]) activate(n); }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
