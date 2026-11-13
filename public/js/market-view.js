/* Market screen: one karat at a time inside the glowing ring, and the arc gauge. Display only —
   the numbers come from the board event, the calculations from board.js. */
(function () {
  'use strict';
  const D = window.DHB_BOARD, $ = id => document.getElementById(id);
  if (!D || !$('heroPrice')) return;
  const nf = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d }) : '—';
  const signed = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d);
  const when = v => new Date(v).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const usable = q => { const t = Date.parse(q && q.sourceTime); return !!q && q.status === 'available' && Number.isFinite(t) && Date.now() - t <= 86400000 && t - Date.now() <= 120000; };
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let karat = '21', last = null, history = null;
  try { const k = localStorage.getItem('dhb-karat'); if (['21', '24', '18'].includes(k)) karat = k; } catch (_) {}

  /* ---- gauge: four bands on a half circle, scale −4% … +8% ---- */
  const NS = 'http://www.w3.org/2000/svg', R = 120, CX = 150, CY = 150;
  const at = (percent, r) => { const a = Math.PI * (1 - D.pin(percent) / 100); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; };
  [[-4, 0, '#70b1d2'], [0, 2, '#89d8be'], [2, 4, '#e7bf67'], [4, 8, '#f0a2aa']].forEach(([from, to, color]) => {
    const p = document.createElementNS(NS, 'path'), a = at(from + .06, R), b = at(to - .06, R);
    p.setAttribute('d', `M${a[0].toFixed(1)} ${a[1].toFixed(1)}A${R} ${R} 0 0 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', '18');
    $('gaugeArcs').appendChild(p);
  });
  [[-4, '−4%'], [0, '0'], [2, '2%'], [4, '4%'], [8, '8%']].forEach(([v, label]) => {
    const t = document.createElementNS(NS, 'text'), p = at(v, R + 22);
    t.setAttribute('x', p[0].toFixed(1)); t.setAttribute('y', (p[1] + 4).toFixed(1)); t.setAttribute('text-anchor', 'middle'); t.textContent = label;
    $('gaugeLabels').appendChild(t);
  });

  /* ---- lightning ring around the price, same idea as the home screen ---- */
  const zap = $('heroZap'), zapPath = zap.querySelector('path');
  const ring = () => { const n = 44; let d = ''; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = 52.5 + (Math.random() * 3.4 - 1.7); d += (i ? 'L' : 'M') + (r * Math.cos(a)).toFixed(1) + ' ' + (r * Math.sin(a)).toFixed(1); } return d + 'Z'; };
  function strike() { let n = 0; zap.classList.add('strike'); const t = setInterval(() => { zapPath.setAttribute('d', ring()); if (++n > 4) { clearInterval(t); zap.classList.remove('strike'); } }, 80); }
  zapPath.setAttribute('d', ring());
  if (!reduced) setInterval(() => { if (!document.hidden) strike(); }, 3200);

  function render() {
    document.querySelectorAll('.x-karat').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.karat === karat)));
    const a = last && last.sources.isagha, q = usable(a) ? D.karat(a, karat) : null;
    $('heroPrice').textContent = q ? nf(q.sell) : '—';
    $('heroBuy').textContent = q ? nf(q.buy) : '—';
    $('heroSpread').textContent = q ? nf(q.sell - q.buy) + ' (' + nf((q.sell - q.buy) / q.sell * 100) + '%)' : '—';
    $('heroTime').textContent = !last ? 'تحميل السعر…' : !q ? 'السعر غير متاح الآن.' :
      'آخر تحديث ' + when(a.sourceTime) + ' • بدون مصنعية' + (karat === '18' ? ' • عيار 18 محسوب من عيار 24' : '');
    const c = $('heroChange'), base = karat === '18' ? '24' : karat;
    const ch = q && history ? D.change(history, base, a[base].sell, new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })) : null;
    c.className = 'chg' + (ch ? (ch.diff > 0 ? ' up' : ch.diff < 0 ? ' dn' : '') : '');
    c.textContent = ch ? (ch.diff > 0 ? '▲ ' : ch.diff < 0 ? '▼ ' : '') + signed(ch.percent) + '% عن أمس' : '';
    const s = last ? last.sources : {};
    $('bankTime').textContent = usable(s.misr) ? 'آخر تحديث ' + when(s.misr.sourceTime) : '';
    $('ounceTime').textContent = usable(s.gold) ? 'آخر تحديث ' + when(s.gold.sourceTime) : '';
    const r = last && last.result;
    $('gaugeNeedle').style.transform = 'rotate(' + (r ? -90 + D.pin(r.gapPercent) * 1.8 : -90) + 'deg)';
    $('gaugeNeedle').style.opacity = r ? 1 : .25;
  }
  document.querySelectorAll('.x-karat').forEach(b => b.addEventListener('click', () => {
    karat = b.dataset.karat; try { localStorage.setItem('dhb-karat', karat); } catch (_) {}
    render(); if (!reduced) strike();
  }));
  fetch((window.DHB_DATA || 'data/') + 'local-history.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null).then(j => { if (j && Array.isArray(j.days)) { history = j.days; render(); } }).catch(() => {});
  window.addEventListener('gold-board-updated', e => { last = e.detail; render(); });
  render();
})();
