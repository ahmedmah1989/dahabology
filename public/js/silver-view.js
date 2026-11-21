/* Silver: global spot (USD per troy ounce, same provider and freshness rule as the gold ounce) and, only when the price file carries it, the local Egypt table. Nothing here converts global silver into an Egyptian price. */
(function (root, factory) { const api = factory(); if (typeof module !== 'undefined') module.exports = api; if (typeof window !== 'undefined') { window.DHB_SILVER = api; api.mount(); } })(this, function () {
  'use strict';
  const OUNCE = 31.1034768, MAX = 86400000;
  const iso = v => typeof v === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
  // Global silver: accept only a USD quote for XAG with a valid, recent provider time.
  function globalSilver(body, now = Date.now()) {
    if (!body || body.symbol !== 'XAG' || (body.currency && body.currency !== 'USD')) return null;
    const p = Number(body.price), t = iso(body.updatedAt) ? Date.parse(body.updatedAt) : NaN;
    if (!(p > 0) || !Number.isFinite(t) || t > now + 120000 || now - t > MAX) return null;
    return { ozUSD: p, gramUSD: p / OUNCE, sourceTime: body.updatedAt };
  }
  const GRADES = ['999', '925', '900', '800', '600'];
  // Local silver rows from the price file. Needs status available, a valid source time within 24 hours and positive numbers.
  function localSilver(q, now = Date.now()) {
    const t = iso(q && q.sourceTime) ? Date.parse(q.sourceTime) : NaN;
    if (!q || q.status !== 'available' || !Number.isFinite(t) || t > now + 120000 || now - t > MAX || !q.grades) return null;
    const rows = GRADES.filter(g => q.grades[g] && q.grades[g].sell > 0 && q.grades[g].buy > 0).map(g => ({ grade: g, buy: q.grades[g].buy, sell: q.grades[g].sell }));
    return rows.length ? { rows, sourceTime: q.sourceTime } : null;
  }
  const when = v => new Date(v).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const nf = (v, d = 2) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  function mount() {
    const $ = id => document.getElementById(id); if (!$('silverGlobal')) return;
    let local = null, glob = null, tried = false;
    function render() {
      const g = $('silverGlobal'); g.replaceChildren();
      if (glob) { const b = document.createElement('b'); b.textContent = nf(glob.ozUSD) + ' دولار للأونصة'; const s = document.createElement('small'); s.textContent = '≈ ' + nf(glob.gramUSD, 3) + ' دولار للجرام فضة خالصة • وقت المصدر ' + when(glob.sourceTime) + ' (القاهرة)'; g.append(b, document.createElement('br'), s); }
      else g.textContent = tried ? 'السعر العالمي للفضة غير متاح الآن أو أقدم من 24 ساعة.' : 'تحميل…';
      const l = $('silverLocal'); l.replaceChildren(); const lc = local && localSilver(local);
      if (lc) {
        const t = document.createElement('table'); t.className = 'silver-t';
        const h = t.insertRow(); ['العيار', 'شراء (جنيه/جرام)', 'بيع (جنيه/جرام)'].forEach(x => { const c = document.createElement('th'); c.textContent = x; h.append(c); });
        lc.rows.forEach(r => { const tr = t.insertRow(); [r.grade, nf(r.buy), nf(r.sell)].forEach(x => tr.insertCell().textContent = x); });
        const n = document.createElement('p'); n.className = 'x-note'; n.textContent = 'المصدر: آي صاغة • وقت المصدر ' + when(lc.sourceTime) + ' (القاهرة) • السعر بدون مصنعية.';
        l.append(t, n);
      } else l.textContent = 'سعر الفضة في السوق المصري لسه مش في ملف الأسعار، فمش هنحوّل السعر العالمي ونسميه سعر محلي.';
    }
    window.addEventListener('gold-board-updated', e => { local = e.detail && e.detail.sources && e.detail.sources.isaghaSilver; render(); });
    const load = () => fetch('https://api.gold-api.com/price/XAG', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(b => { glob = globalSilver(b); }).catch(() => { glob = null; }).then(() => { tried = true; render(); });
    load(); setInterval(load, 60000); render();
  }
  return { globalSilver, localSilver, mount };
});
