/* Dahabology board extras: buy prices, spread, 18k, the local-vs-global meter,
   change vs the last archived close, header price, and "compare with my purchase price".
   Reads the same event the monitor publishes; never invents a price. */
(function () {
  'use strict';
  const LOW = -4, HIGH = 8;                       // meter scale, percent
  /** Position of a premium on the meter, 0..100. */
  function pin(percent) { return Math.min(100, Math.max(0, (percent - LOW) / (HIGH - LOW) * 100)); }
  /** Descriptive band for the local premium over the converted global value. Limits 2% / 4% are descriptive, not a fair-price standard. */
  function verdict(percent) {
    if (!Number.isFinite(percent)) return { key: 'none', text: 'المقارنة معلّقة' };
    if (percent < 0) return { key: 'low', text: 'أقل من العالمي' };
    if (percent <= 2) return { key: 'near', text: 'قريب من العالمي' };
    if (percent <= 4) return { key: 'mid', text: 'علاوة متوسطة' };
    return { key: 'high', text: 'علاوة عالية' };
  }
  /** Sell / buy for a karat. 24 and 21 are published; 18 is derived from 24 by purity. */
  function karat(isagha, k) {
    if (k === '18') { const b = isagha && isagha['24']; return b ? { sell: b.sell * 18 / 24, buy: b.buy * 18 / 24, derived: true } : null; }
    return isagha && isagha[k] ? { sell: isagha[k].sell, buy: isagha[k].buy, derived: false } : null;
  }
  /** Change of the current sell price against the last archived close before `today` (YYYY-MM-DD, Cairo). */
  function change(days, k, sell, today) {
    const prev = (days || []).filter(d => d.d < today && d[k] && Number.isFinite(d[k].close)).pop();
    if (!prev || !Number.isFinite(sell)) return null;
    const diff = sell - prev[k].close;
    return { diff, percent: diff / prev[k].close * 100, date: prev.d };
  }
  /** Gain or loss per gram if a past purchase were sold to the dealer now. */
  function compare(paid, buyNow, grams) {
    if (![paid,buyNow].every(v=>Number.isFinite(v)&&v>0)) return null;
    const diff = buyNow - paid;
    return { diff, percent: diff / paid * 100, total: Number.isFinite(grams)&&grams > 0&&Number.isFinite(diff*grams) ? diff * grams : null };
  }
  if (typeof module !== 'undefined') module.exports = { pin, verdict, karat, change, compare };
  if (typeof document === 'undefined') return;
  window.DHB_BOARD = { pin, verdict, karat, change, compare };

  const $ = id => document.getElementById(id);
  const set =(id, text) => { const e = $(id); if (e) e.textContent = text; };
  const nf = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d }) : '—';
  const egp = (v, d = 2) => Number.isFinite(v) ? nf(v, d) + ' جنيه' : '—';
  const signed = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d);
  const num = v => { const s = String(v == null ? '' : v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,\s]/g, '').replace(/٫/g, '.'); return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; };
  const cairoDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const usable = q => { const t = Date.parse(q && q.sourceTime); return !!q && q.status === 'available' && Number.isFinite(t) && Date.now() - t <= 86400000 && t - Date.now() <= 120000; };

  let last = null, history = null;
  fetch((window.DHB_DATA || 'data/') + 'local-history.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null).then(j => { if (j && Array.isArray(j.days)) { history = j.days; if (last) render(last); } }).catch(() => {});

  function render(detail) {
    last = detail;
    const a = detail.sources.isagha, ok = usable(a), r = detail.result;
    set('headPrice21', ok ? nf(a['21'].sell) : '—');

    ['24', '21', '18'].forEach(k => {
      const q = ok ? karat(a, k) : null;
      set('buy' + k, q ? egp(q.buy) : 'غير متاح');
      set('spread' + k, q ? egp(q.sell - q.buy) + ' (' + nf((q.sell - q.buy) / q.sell * 100) + '%)' : '—');
      if (k === '18') {
        const e = $('price18');
        if (e) { e.replaceChildren(); if (q) { e.append(nf(q.sell)); const s = document.createElement('small'); s.className = 'price-unit'; s.textContent = 'جنيه / جرام'; e.append(s); } else e.textContent = 'غير متاح'; }
      }
      const c = $('chg' + k);
      if (c) {
        const ch = q && history ? change(history, k === '18' ? '24' : k, k === '18' ? a['24'].sell : q.sell, cairoDay()) : null;
        c.className = 'chg' + (ch ? (ch.diff > 0 ? ' up' : ch.diff < 0 ? ' dn' : '') : '');
        c.textContent = ch ? (ch.diff > 0 ? '▲ ' : ch.diff < 0 ? '▼ ' : '') + signed(ch.percent) + '%' : '';
        c.title = ch ? 'عن آخر إغلاق مسجل يوم ' + ch.date : '';
      }
    });

    const pinEl = $('gapPin'), v = verdict(r ? r.gapPercent : NaN), badge = $('gapVerdict');
    if (pinEl) { pinEl.hidden = !r; if (r) pinEl.style.left = pin(r.gapPercent) + '%'; }
    if (badge) { badge.textContent = v.text; badge.className = 'meter-verdict v-' + v.key; }
    if ($('gapBig')) set('gapBig', r ? signed(r.gapPercent) + '%' : '—');
    myref();
  }

  /* ---- compare with my purchase price (stays on this device) ---- */
  function myref() {
    const out = $('myrefOut'); if (!out) return;
    const k = $('myrefKarat').value, paid = num($('myrefPrice').value), grams = num($('myrefGrams').value);
    try { localStorage.setItem('dhb-myref', JSON.stringify({ k, p: $('myrefPrice').value, g: $('myrefGrams').value })); } catch (_) {}
    const a = last && last.sources.isagha, q = a && usable(a) ? karat(a, k) : null;
    set('myrefNow', q ? egp(q.buy) : 'غير متاح');
    const c = q ? compare(paid, q.buy, grams) : null;
    set('myrefDiff', c ? signed(c.diff) + ' جنيه للجرام (' + signed(c.percent) + '%)' : '—');
    set('myrefTotal', c && c.total !== null ? signed(c.total, 0) + ' جنيه' : '—');
    const d = $('myrefDiff'); if (d) d.className = c ? (c.diff >= 0 ? 'up' : 'dn') : '';
  }
  if ($('myrefOut')) {
    try { const s = JSON.parse(localStorage.getItem('dhb-myref')); if (s) { $('myrefKarat').value = s.k || '21'; $('myrefPrice').value = s.p || ''; $('myrefGrams').value = s.g || ''; } } catch (_) {}
    ['myrefKarat', 'myrefPrice', 'myrefGrams'].forEach(id => $(id).addEventListener('input', myref));
  }
  window.addEventListener('gold-board-updated', e => render(e.detail));
})();
