/* Dahabology user-target price alert: user sets a target for the 21k gram sell price; fires once when
   a FRESH quote crosses it. Freshness gate: quote age <= 15 min (~3x observed source cadence), not the
   24h display gate. No retroactive fire: with no prior fresh reading, it re-arms from the current price. */
(function(){
  'use strict';
  const KEY = 'gold-target-alert-v1';
  const FRESH_MS = 15 * 60 * 1000, FUTURE_MS = 2 * 60 * 1000;

  function fresh(price, sourceTime, now) {
    const t = Date.parse(sourceTime);
    return Number.isFinite(price) && price > 0 && Number.isFinite(t) && now - t <= FRESH_MS && t - now <= FUTURE_MS;
  }
  function load(store) { try { const s = JSON.parse((store || localStorage).getItem(KEY)); return s && Number.isFinite(s.target) ? s : null; } catch (_) { return null; } }
  function save(state, store) { try { state ? (store || localStorage).setItem(KEY, JSON.stringify(state)) : (store || localStorage).removeItem(KEY); } catch (_) {} }

  // Arm a new target. current = {price, sourceTime} of a fresh quote. Direction derives from the target side.
  function arm(target, current, now = Date.now(), store) {
    if (!Number.isFinite(target) || target <= 0) return null;
    if (!current || !fresh(current.price, current.sourceTime, now)) return { target, direction: null, state: 'waiting-first-fresh', armedAt: now, lastSeen: null, firedAt: null };
    const state = { target, direction: target > current.price ? 'up' : target < current.price ? 'down' : 'at', state: 'armed', armedAt: now,
      lastSeen: { price: current.price, sourceTime: current.sourceTime }, firedAt: null };
    save(state, store); return state;
  }
  function clear(store) { save(null, store); }

  // Evaluate against the latest quote. Returns {state, notice?}; notice present exactly once per crossing.
  function evaluate(state, price, sourceTime, now = Date.now(), store) {
    if (!state || !Number.isFinite(state.target)) return { state: 'none' };
    if (!fresh(price, sourceTime, now)) return { state: 'paused-stale' }; // market closed / source frozen: never fire on old data
    const cur = { price, sourceTime };
    if (!state.lastSeen || state.direction === null) { // reopen without a usable prior reading: re-arm silently
      const next = { ...state, direction: state.target > price ? 'up' : state.target < price ? 'down' : 'at', state: 'armed', lastSeen: cur };
      save(next, store); return { state: 'armed-silently' };
    }
    const crossedUp = state.direction === 'up' && state.lastSeen.price < state.target && price >= state.target;
    const crossedDown = state.direction === 'down' && state.lastSeen.price > state.target && price <= state.target;
    if ((crossedUp || crossedDown) && !state.firedAt) {
      const next = { ...state, state: 'fired', firedAt: new Date(now).toISOString(), lastSeen: cur };
      save(next, store);
      return { state: 'fired', notice: 'وصل الذهب لهدفك: عيار 21 عند ' + price.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' جنيه (هدفك ' + state.target + ').' };
    }
    const next = { ...state, lastSeen: cur };
    save(next, store);
    return { state: state.firedAt ? 'fired' : 'armed' };
  }

  if (typeof module !== 'undefined') module.exports = { arm, evaluate, clear, load, fresh, FRESH_MS };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const box = $('targetAlertBox'); if (!box) return;
  function render(state, extra) {
    const status = $('targetAlertStatus'), input = $('targetAlertValue');
    if (!status) return;
    if (extra) { status.textContent = extra; return; }
    if (!state) { status.textContent = 'اختار السعر المستهدف، وهنبّهك على هذا الجهاز.'; return; }
    const dist = state.lastSeen ? Math.abs(state.target - state.lastSeen.price) : null;
    status.textContent = state.state === 'fired'
      ? 'اتفعل التنبيه عند هدفك ' + state.target + '. امسحه أو حدّد هدفًا جديدًا.'
      : 'هدفك ' + state.target + ' جنيه لعيار 21' + (dist !== null ? ' - على بُعد ' + dist.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' جنيه' : '') + '. التنبيه على هذا الجهاز أثناء البرنامج أو عند فتحه، ويتوقف لو السعر لم يتحدث.';
    if (input && document.activeElement !== input) input.value = state.target;
  }
  let lastSources = null;
  function current21() {
    const a = lastSources && lastSources.isagha;
    return a && a['21'] ? { price: a['21'].sell, sourceTime: a.sourceTime } : null;
  }
  window.addEventListener('gold-board-updated', e => {
    lastSources = (e && e.detail && e.detail.sources) || lastSources;
    const st = load(); if (!st) { render(null); return; }
    const c = current21();
    const r = c ? evaluate(st, c.price, c.sourceTime) : { state: 'paused-stale' };
    if (r.notice) {
      const li = document.createElement('li'); li.textContent = new Date().toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo' }) + ' - ' + r.notice;
      const list = $('targetAlertNotices'); if (list) { list.prepend(li); while (list.children.length > 5) list.lastElementChild.remove(); }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') { try { new Notification('دهبولوجي: هدف السعر', { body: r.notice }); } catch (_) {} }
      render(load(), r.notice);
    } else if (r.state === 'paused-stale') render(st, 'التنبيه متوقف مؤقتًا - لم يصل سعر محدث منذ أكثر من 15 دقيقة. لا إطلاق على سعر قديم، وهيعود يشتغل أول ما يتحدث السعر.');
    else render(load());
  });
  const btn = $('targetAlertSet'), clr = $('targetAlertClear'), input = $('targetAlertValue');
  if (btn) btn.addEventListener('click', () => {
    const v = Number(String(input.value || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,\s]/g, ''));
    const c = current21();
    const st = arm(v, c && c.price ? c : null);
    if (!st) { render(null, 'اكتب رقمًا صحيحًا أكبر من صفر.'); return; }
    if (st.state === 'waiting-first-fresh') render(st, 'اتحفظ هدفك ' + v + '. هيشتغل أول ما يوصل سعر حديث.');
    else render(st);
  });
  if (clr) clr.addEventListener('click', () => { clear(); render(null); });
  render(load());
})();
