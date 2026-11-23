/* Market page tabs: السوق / التحليل / الرسم الحي on one page.
   The old /analysis/ and /live/ addresses redirect here with a hash; this script opens the right
   pane, lazy-loads the analysis bundle only when its tab is first opened (it pulls an external
   daily FX series, so plain market visits should not pay for it), and keeps h1/title honest. */
(function () {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('.market-tabs [role="tab"]'));
  if (!tabs.length) return;
  const panes = {}, META = {
    market: { h: 'سعر الذهب الآن', t: 'سعر الذهب اليوم في مصر | عيار 21 و24 و18 والدولار الضمني — دهبولوجي' },
    analysis: { h: 'تحليل الذهب', t: 'تحليل الذهب: قراءة اليوم والاتجاه والمتوسطات — دهبولوجي' },
    live: { h: 'الرسم الحي', t: 'رسم الذهب العالمي المباشر XAUUSD — دهبولوجي' }
  };
  tabs.forEach(t => { panes[t.getAttribute('data-pane')] = document.getElementById('pane-' + t.getAttribute('data-pane')); });
  let analysisLoaded = false, analysisPending = false;
  function version() {
    const s = document.querySelector('script[src*="quote-state.js"]'), m = s && s.src.match(/[?&]v=([^&]+)/);
    return m ? '?v=' + m[1] : '';
  }
  /* Honest failure state: if the lazy analysis bundle cannot load (offline first activation,
     new version not cached yet), say so and offer retry instead of leaving a silent shell. */
  function analysisNote(show) {
    let n = document.getElementById('analysisLoadNote');
    if (!n && show && panes.analysis) {
      n = document.createElement('p');
      n.id = 'analysisLoadNote';
      n.className = 'x-note';
      n.setAttribute('role', 'status');
      n.append(document.createTextNode('تعذّر تحميل التحليل الآن، غالبًا لانقطاع الاتصال. لن نعرض أرقامًا قديمة كأنها جديدة. '));
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'analysisRetry'; b.textContent = 'إعادة المحاولة';
      b.style.cssText = 'margin-inline-start:8px;padding:6px 14px;border:1.5px solid #eac674;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer';
      b.addEventListener('click', () => { analysisNote(false); loadAnalysis(); });
      n.append(b);
      panes.analysis.insertBefore(n, panes.analysis.firstChild);
    }
    if (n) n.hidden = !show;
  }
  function loadAnalysis() {
    if (analysisLoaded || analysisPending) return;
    analysisPending = true;
    const base = window.DHB_BASE || '/', v = version();
    const fail = () => { analysisPending = false; analysisNote(true); };
    const ui = document.createElement('script'); ui.src = base + 'js/ui.js' + v;
    const an = document.createElement('script'); an.src = base + 'js/analytics.js' + v;
    an.onload = () => {
      ui.onload = () => { analysisLoaded = true; analysisPending = false; analysisNote(false); };
      ui.onerror = fail;
      document.head.append(ui);
      /* The first price update may have fired before analytics registered its listener;
         replay the board's current state so today’s reading does not wait for the next cycle. */
      const d = window.DHB_BOARD && window.DHB_BOARD.detail && window.DHB_BOARD.detail();
      if (d) window.dispatchEvent(new CustomEvent('gold-board-updated', { detail: d }));
    };
    an.onerror = fail;
    document.head.append(an);
  }
  window.addEventListener('online', () => { if (!analysisLoaded && panes.analysis && !panes.analysis.hidden) loadAnalysis(); });
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
    if (name === 'analysis') loadAnalysis();
    if (name === 'live' && typeof window.DHB_LIVE_RENDER === 'function') window.DHB_LIVE_RENDER();
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
  function fromHash() { const n = (location.hash || '').slice(1); if (panes[n]) { activate(n); return true; } return false; }
  /* Fragment scrolling is left to the browser: the pane sections carry scroll-margin-top so the
     native jump - initial load AND same-document hashchange, at any load speed - lands with the
     tab strip visible below the sticky header. A scripted re-assert raced the browser's own
     fragment scroll and either jumped late or lost entirely, so there is deliberately none. */
  window.addEventListener('hashchange', () => { fromHash(); });
  /* Deep-link landing: open the requested pane so its section exists in layout before the
     browser's own fragment scroll looks for it. */
  fromHash();
})();
