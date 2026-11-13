/* Dahabology tools: invoice check, "my gold" wallet (kept on this device), and the shareable price card. */
(function () {
  'use strict';
  const PURITY = { '24': 1, '21': 21 / 24, '18': 18 / 24 };

  /** Sell / buy per gram for a karat from the isagha quote. 18 is derived from 24 by purity. */
  function prices(isagha, k) {
    if (!isagha) return null;
    if (k === '18') return isagha['24'] ? { sell: isagha['24'].sell * 0.75, buy: isagha['24'].buy * 0.75 } : null;
    return isagha[k] ? { sell: isagha[k].sell, buy: isagha[k].buy } : null;
  }

  /**
   * What an invoice total contains beyond the gold itself.
   * sell/buy: dealer's prices per gram now. vat: percent on the making charge (used only to split the extra).
   */
  function inspect(o) {
    if (!(o.sell > 0) || !(o.grams > 0) || !(o.total > 0)) return null;
    const gold = o.grams * o.sell, extra = o.total - gold, vat = o.vat > 0 ? o.vat : 0;
    const perGram = extra / o.grams, making = perGram / (1 + vat / 100);
    const resale = o.buy > 0 ? o.grams * o.buy : null;
    return {
      gold, extra, extraPerGram: perGram, extraPercent: extra / o.total * 100,
      makingPerGram: making, taxPerGram: perGram - making,
      resale, loss: resale === null ? null : o.total - resale, lossPercent: resale === null ? null : (o.total - resale) / o.total * 100,
      belowGold: extra < 0,
    };
  }

  /** Current value of saved purchases at the dealer's buy price. items: [{k, g, paid}] */
  function wallet(items, isagha) {
    const rows = items.map(it => {
      const p = prices(isagha, it.k), now = p ? it.g * p.buy : null;
      return Object.assign({}, it, { now, diff: now === null ? null : now - it.paid, percent: now === null || !(it.paid > 0) ? null : (now - it.paid) / it.paid * 100 });
    });
    const priced = rows.every(r => r.now !== null) && rows.length > 0;
    const paid = rows.reduce((s, r) => s + r.paid, 0), now = priced ? rows.reduce((s, r) => s + r.now, 0) : null;
    return {
      rows, paid, now, diff: now === null ? null : now - paid, percent: now === null || !(paid > 0) ? null : (now - paid) / paid * 100,
      grams: rows.reduce((s, r) => s + r.g, 0), pure: rows.reduce((s, r) => s + r.g * PURITY[r.k], 0),
    };
  }
  if (typeof module !== 'undefined') module.exports = { prices, inspect, wallet };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
  const num = v => { const s = String(v == null ? '' : v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,\s]/g, '').replace(/٫/g, '.'); return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; };
  const nf = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d }) : '—';
  const egp = (v, d = 0) => Number.isFinite(v) ? nf(v, d) + ' جنيه' : '—';
  const signed = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d);
  const usable = q => { const t = Date.parse(q && q.sourceTime); return !!q && q.status === 'available' && Number.isFinite(t) && Date.now() - t <= 86400000; };
  const when = v => new Date(v).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  let last = null;
  const local = () => last && usable(last.sources.isagha) ? last.sources.isagha : null;

  /* ---------- invoice check ---------- */
  function invoice() {
    if (!$('invOut')) return;
    const a = local(), k = $('invKarat').value, p = a ? prices(a, k) : null;
    if (p && !$('invPrice').dataset.edited) $('invPrice').value = Math.round(p.sell * 100) / 100;
    const sell = num($('invPrice').value);
    const r = inspect({ sell, buy: p ? p.buy : NaN, grams: num($('invGrams').value), total: num($('invTotal').value), vat: num($('invVat').value) });
    set('invNote', $('invPrice').dataset.edited ? 'الحساب بسعر الجرام الذي أدخلته.' : a ? 'سعر الجرام من آخر قراءة آي صاغة: ' + when(a.sourceTime) + '.' : 'في انتظار السعر؛ تقدر تكتب سعر الجرام يوم الشراء بنفسك.');
    const share = r && !r.belowGold ? Math.min(100, Math.max(0, r.extraPercent)) : 0, donut = $('invDonut');
    if (donut) { donut.style.strokeDasharray = share + ' ' + (100 - share); set('invDonutPct', r && !r.belowGold ? nf(r.extraPercent, 1) + '%' : '—'); }
    const v = $('invVerdict');
    if (!r) { v.textContent = 'اكتب الوزن والمبلغ لتظهر النتيجة'; v.className = 'x-verdict'; ['invGold', 'invExtra', 'invPerGram', 'invMaking', 'invTax', 'invResale', 'invLoss'].forEach(id => set(id, '—')); return; }
    if (r.belowGold) { v.textContent = 'المبلغ أقل من قيمة الذهب بهذا السعر. راجع الوزن أو العيار أو سعر الجرام.'; v.className = 'x-verdict warn'; }
    else { v.textContent = 'دفعت ' + egp(r.extra) + ' فوق قيمة الذهب'; v.className = 'x-verdict'; }
    set('invGold', egp(r.gold)); set('invExtra', egp(r.extra) + ' (' + nf(r.extraPercent, 1) + '%)'); set('invPerGram', egp(r.extraPerGram, 2));
    set('invMaking', r.belowGold ? '—' : egp(r.makingPerGram, 2)); set('invTax', r.belowGold ? '—' : egp(r.taxPerGram, 2));
    set('invResale', r.resale === null ? 'غير متاح' : egp(r.resale)); set('invLoss', r.loss === null ? '—' : egp(r.loss) + ' (' + nf(r.lossPercent, 1) + '%)');
  }
  if ($('invOut')) {
    ['invKarat', 'invGrams', 'invTotal', 'invVat'].forEach(id => $(id).addEventListener('input', () => { if (id === 'invKarat') delete $('invPrice').dataset.edited; invoice(); }));
    $('invPrice').addEventListener('input', () => { $('invPrice').dataset.edited = '1'; invoice(); });
    invoice();
  }

  /* ---------- my gold ---------- */
  const KEY = 'dhb-wallet-v1';
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v.filter(i => PURITY[i.k] && i.g > 0 && i.paid >= 0) : []; } catch (_) { return []; } };
  const save = items => { try { localStorage.setItem(KEY, JSON.stringify(items)); return true; } catch (_) { return false; } };
  function piece(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }
  function walletRender() {
    if (!$('walRows')) return;
    const items = load(), w = wallet(items, local()), body = $('walRows');
    body.replaceChildren();
    $('walEmpty').hidden = items.length > 0; $('walTable').hidden = items.length === 0;
    w.rows.forEach(r => {
      const it = document.createElement('div'); it.className = 'x-item';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wal-del'; b.textContent = 'حذف'; b.setAttribute('aria-label', 'حذف هذه القطعة');
      b.addEventListener('click', () => { if (confirm('حذف هذه القطعة من دهبي؟')) { save(load().filter(i => i.id !== r.id)); walletRender(); } });
      it.append(
        piece('b', '', (r.note || 'ذهب') + ' • عيار ' + r.k), piece('span', 'v', r.now === null ? '—' : egp(r.now)),
        piece('span', 'w', nf(r.g, 3) + ' جرام • دفعت ' + egp(r.paid)), piece('span', 'd' + (r.diff === null ? '' : r.diff >= 0 ? ' up' : ' dn'), r.diff === null ? '' : signed(r.diff) + ' (' + signed(r.percent, 1) + '%)'),
        piece('span', 'p', ''), b);
      body.append(it);
    });
    set('walNow', items.length ? (w.now === null ? '—' : egp(w.now)) : '0 جنيه');
    set('walPaid', items.length ? egp(w.paid) : '—');
    set('walWeight', items.length ? nf(w.grams, 3) + ' جم' : '—');
    const d = $('walDiff'); d.textContent = w.diff === null ? '' : signed(w.diff) + ' (' + signed(w.percent, 1) + '%)'; d.className = 'chg' + (w.diff === null ? '' : w.diff >= 0 ? ' up' : ' dn');
    set('walGrams', items.length ? (w.now === null ? 'في انتظار السعر من المصدر. ' : '') + 'يعادل ' + nf(w.pure, 3) + ' جرام عيار 24' : '');
  }
  if ($('walRows')) {
    $('walForm').addEventListener('submit', e => {
      e.preventDefault();
      const g = num($('walGramsIn').value), paid = num($('walPaidIn').value);
      if (!(g > 0) || !(paid >= 0)) { set('walMsg', 'اكتب الوزن والمبلغ المدفوع بأرقام صحيحة.'); return; }
      const items = load(); items.push({ id: Date.now().toString(36), k: $('walKarat').value, g, paid, note: $('walNoteIn').value.trim().slice(0, 40) });
      set('walMsg', save(items) ? 'اتحفظت على هذا الجهاز.' : 'المتصفح منع الحفظ؛ القطعة لن تبقى بعد إغلاق الصفحة.');
      ['walGramsIn', 'walPaidIn', 'walNoteIn'].forEach(id => $(id).value = ''); walletRender();
    });
    walletRender();
  }

  /* ---------- share card ---------- */
  function img(src) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); }
  async function card() {
    const a = local(), s = last.sources, B = window.DHB_BASE || '';
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const x = c.getContext('2d'), F = (w, px) => w + ' ' + px + 'px "IBM Plex Sans Arabic", Tahoma, sans-serif';
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#070f1e'); g.addColorStop(.5, '#12233b'); g.addColorStop(1, '#070f1e');
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    try { const bg = await img(B + 'assets/logo-900.webp'); x.globalAlpha = .09; x.drawImage(bg, 90, 300, 900, 900); x.globalAlpha = 1; } catch (_) {}
    try { const em = await img(B + 'assets/emblem.webp'); x.drawImage(em, 430, 50, 220, 220); } catch (_) {}
    x.direction = 'rtl'; x.textAlign = 'center'; x.fillStyle = '#f0ca78'; x.font = F(700, 76); x.fillText('دهبولوجي', 540, 350);
    x.fillStyle = '#d8e3f0'; x.font = F(600, 38); x.fillText('سعر الذهب في مصر • ' + when(a.sourceTime), 540, 415);
    const rows = [['عيار 21', '21'], ['عيار 24', '24'], ['عيار 18 (محسوب)', '18']];
    rows.forEach((r, i) => {
      const p = prices(a, r[1]), y = 480 + i * 190;
      x.fillStyle = '#102139'; x.strokeStyle = '#e7bf67'; x.lineWidth = 2; x.beginPath(); x.roundRect(70, y, 940, 160, 26); x.fill(); x.stroke();
      x.textAlign = 'right'; x.fillStyle = '#ffffff'; x.font = F(700, 46); x.fillText(r[0], 970, y + 68);
      x.fillStyle = '#b4c4d8'; x.font = F(600, 32); x.fillText('شراء التاجر منك: ' + nf(p.buy), 970, y + 122);
      x.textAlign = 'left'; x.fillStyle = '#f3dcaa'; x.font = F(700, 78); x.fillText(nf(p.sell), 110, y + 100);
    });
    x.textAlign = 'center'; x.fillStyle = '#d8e3f0'; x.font = F(600, 36);
    const extras = [];
    if (usable(s.misr)) extras.push('الدولار في بنك مصر ' + nf(s.misr.sell));
    if (usable(s.gold)) extras.push('الأونصة ' + nf(s.gold.sell) + ' $');
    if (extras.length) x.fillText(extras.join('   •   '), 540, 1110);
    x.fillStyle = '#acbdd2'; x.font = F(500, 30); x.fillText('سعر الجرام بالجنيه بدون مصنعية • المصدر: آي صاغة', 540, 1200);
    x.fillStyle = '#e7bf67'; x.font = F(700, 34); x.fillText(location.host + (B === '/' ? '' : B.replace(/\/$/, '')), 540, 1270);
    return (await fetch(c.toDataURL('image/png'))).blob();
  }
  const share = $('shareBtn');
  if (share) share.addEventListener('click', async () => {
    if (!local()) { set('shareMsg', 'السعر غير متاح الآن؛ جرّب بعد تحديث الأسعار.'); return; }
    share.disabled = true; set('shareMsg', 'تجهيز الصورة…');
    try {
      const blob = await card(), file = new File([blob], 'dahabology-gold-price.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'سعر الذهب اليوم — دهبولوجي' }); set('shareMsg', ''); }
      else { const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = file.name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); set('shareMsg', 'اتحفظت الصورة على جهازك.'); }
    } catch (e) { set('shareMsg', e && e.name === 'AbortError' ? '' : 'تعذر تجهيز الصورة على هذا المتصفح.'); }
    share.disabled = false;
  });
  window.DHB_CARD = () => card();   // lets the card be previewed while developing

  window.addEventListener('gold-board-updated', e => { last = e.detail; invoice(); walletRender(); });
})();
