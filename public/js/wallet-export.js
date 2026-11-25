/* Wallet export: one CSV file of exactly what the wallet lists (account + device pieces),
   downloaded through a Blob URL and a synthetic anchor. Rules kept from the ledger:
   blank means not recorded (never zero), the paid total is copied as saved, no auth token
   or image data ever leaves the page. Native share is not implemented. */
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
  if (typeof module !== 'undefined') module.exports = { buildCsv, filename, cell };
  if (typeof document === 'undefined' || !document.getElementById('walExport')) return;
  const btn = document.getElementById('walExport');
  const say = t => { const m = document.getElementById('walMsg'); if (m) { m.textContent = t || ''; m.className = 'x-msg' + (t ? ' err' : ''); } };
  const deviceItems = () => {
    try {
      const v = JSON.parse(localStorage.getItem('dhb-wallet-v1'));
      return Array.isArray(v) ? v.filter(i => i && Number.isFinite(i.g) && i.g > 0 && Number.isFinite(i.paid) && i.paid >= 0) : [];
    } catch (_) { return []; }
  };
  btn.addEventListener('click', () => {
    // Snapshot at click time; if the account identity changes before the download fires, abort with no file.
    const cloudRef = window.DHB_CLOUD_ITEMS, cloudSnap = Array.isArray(cloudRef) ? cloudRef : [];
    const ids = new Set(cloudSnap.map(i => i.id));
    const items = cloudSnap.map(i => Object.assign({}, i, { where: 'account' }))
      .concat(deviceItems().filter(i => !ids.has(i.id)).map(i => Object.assign({}, i, { where: 'device' })));
    if (!items.length) { say('مفيش قطع تتصدّر لسه.'); return; }
    const day = today();
    const blob = new Blob([buildCsv(items, day)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (window.DHB_CLOUD_ITEMS !== cloudRef) { URL.revokeObjectURL(url); say('الحساب اتغيّر أثناء التصدير. ما نزلش أي ملف؛ جرّب تاني.'); return; }
    const a = document.createElement('a');
    a.href = url; a.download = filename(day); a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
})();
