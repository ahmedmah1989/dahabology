/* Wallet export: one CSV file of exactly what the wallet lists (account + device pieces),
   downloaded through a Blob URL and a synthetic anchor. Rules kept from the ledger:
   blank means not recorded (never zero), the paid total is copied as saved, no auth token
   or image data ever leaves the page. Sharing is optional: a second button appears only when the
   browser can share a file, and it runs only on the user's own tap (cancel is silent). */
(function () {
  'use strict';
  const TYPES = { bar: 'سبيكة', coin: 'جنيه', jewelry: 'مصوغات', scrap: 'كسر' };
  const STONES = { with: 'بفصوص', without: 'بدون فصوص' };
  const HEADERS = ['القطعة', 'النوع', 'العيار', 'الوزن (جرام)', 'تاريخ الشراء', 'المدفوع (جنيه)', 'المصنعية', 'الضريبة', 'الدمغة', 'الفصوص', 'المصدر', 'رقم الفاتورة'];
  function cell(v) {
    if (v === undefined || v === null || v === '') return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula guard: never emit an executable cell
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function rowOf(it) {
    const r = it.rec || {};
    const grams = Number.isFinite(it.g) ? it.g : (Number.isFinite(r.grams) ? r.grams : '');
    const paid = Number.isFinite(it.paid) ? it.paid : (Number.isFinite(r.paid) ? r.paid : '');
    return [it.note || r.label || '', TYPES[r.type] || '', it.k || (r.karat || ''), grams,
      r.purchaseDate || '', paid, r.making, r.tax, r.stamp, STONES[r.stones] || '',
      it.where === 'device' ? 'على الجهاز' : 'في الحساب', r.invoiceId || ''].map(cell).join(',');
  }
  function buildCsv(items, day) {
    const lines = [HEADERS.map(cell).join(',')];
    (Array.isArray(items) ? items : []).forEach(it => lines.push(rowOf(it)));
    lines.push('');
    lines.push([cell('دهبولوجي — نسخة من دهبي بتاريخ ' + day), cell('الخانة الفارغة تعني غير مسجلة، وليست صفرًا. الأرقام كما حُفظت بدون إعادة حساب.')].join(','));
    return '﻿' + lines.join('\r\n');
  }
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const filename = day => 'dahabology-wallet-' + day + '.csv';
  if (typeof module !== 'undefined') module.exports = { buildCsv, filename, cell, snapshot };
  if (typeof document === 'undefined' || !document.getElementById('walExport')) return;
  const btn = document.getElementById('walExport');
  // Messages sit right under the two buttons (walExportMsg); walMsg under the form is only a fallback.
  const say = (t, info) => { const m = document.getElementById('walExportMsg') || document.getElementById('walMsg'); if (m) { m.textContent = t || ''; m.className = 'x-msg' + (t && !info ? ' err' : ''); } };
  const deviceItems = () => {
    try {
      const v = JSON.parse(localStorage.getItem('dhb-wallet-v1'));
      return Array.isArray(v) ? v.filter(i => i && Number.isFinite(i.g) && i.g > 0 && Number.isFinite(i.paid) && i.paid >= 0) : [];
    } catch (_) { return []; }
  };
  // Items at click time: account pieces first, then device pieces not already in the account.
  function snapshot() {
    const cloudRef = window.DHB_CLOUD_ITEMS, cloudSnap = Array.isArray(cloudRef) ? cloudRef : [];
    const ids = new Set(cloudSnap.map(i => i.id));
    return { cloudRef, items: cloudSnap.map(i => Object.assign({}, i, { where: 'account' }))
      .concat(deviceItems().filter(i => !ids.has(i.id)).map(i => Object.assign({}, i, { where: 'device' }))) };
  }
  btn.addEventListener('click', () => {
    // If the account identity changes before the download fires, abort with no file.
    const { cloudRef, items } = snapshot();
    if (!items.length) { say('مفيش قطع تتصدّر لسه.'); return; }
    const day = today();
    const blob = new Blob([buildCsv(items, day)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (window.DHB_CLOUD_ITEMS !== cloudRef) { URL.revokeObjectURL(url); say('الحساب اتغيّر أثناء التصدير. ما نزلش أي ملف؛ جرّب تاني.'); return; }
    const a = document.createElement('a');
    a.href = url; a.download = filename(day); a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    // The click only requests the download; the browser gives no completion signal here, so do not say it finished.
    say('اتطلب تنزيل الملف. لو ما ظهرش، شوف ملفات التنزيل في جهازك.', true);
  });
  // Optional share: shown only if this browser can share a CSV file. Never runs without a tap.
  const sbtn = document.getElementById('walShare');
  const canShareCsv = () => {
    try { return !!(sbtn && typeof File === 'function' && navigator.share && navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.csv', { type: 'text/csv' })] })); } catch (_) { return false; }
  };
  if (canShareCsv()) {
    sbtn.hidden = false;
    sbtn.addEventListener('click', async () => {
      const { cloudRef, items } = snapshot();
      if (!items.length) { say('مفيش قطع تتصدّر لسه.'); return; }
      const day = today();
      const file = new File([buildCsv(items, day)], filename(day), { type: 'text/csv' });
      if (window.DHB_CLOUD_ITEMS !== cloudRef) { say('الحساب اتغيّر أثناء التصدير. ما اتشاركش أي ملف؛ جرّب تاني.'); return; }
      try { await navigator.share({ files: [file], title: 'نسخة من دهبي' }); say(''); } // cancel and success stay silent
      catch (e) { if (!e || e.name !== 'AbortError') say('ما اتشاركش الملف. استخدم زر التنزيل.'); else say(''); }
    });
  }
})();
