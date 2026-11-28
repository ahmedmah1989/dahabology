/* Dahabology tools: invoice check, "my gold" wallet (kept on this device), and the shareable price card. */
(function () {
  'use strict';
  const PURITY = { '24': 1, '21': 21 / 24, '18': 18 / 24 };

  /** Sell / buy per gram for a karat from the isagha quote. 18 is derived from 24 by purity. */
  function prices(isagha, k) {
    if (!isagha) return null;
    const base=isagha[k==='18'?'24':k];
    if(!base||![base.sell,base.buy].every(v=>Number.isFinite(v)&&v>0))return null;
    if (k === '18') return isagha['24'] ? { sell: isagha['24'].sell * 0.75, buy: isagha['24'].buy * 0.75 } : null;
    return isagha[k] ? { sell: isagha[k].sell, buy: isagha[k].buy } : null;
  }

  /**
   * What an invoice total contains beyond the gold itself.
   * sell/buy: dealer's prices per gram now. vat: percent on the making charge (used only to split the extra).
   */
  function inspect(o) {
    if (![o.sell,o.grams,o.total].every(v=>Number.isFinite(v)&&v>0) || (o.vat!==undefined&&(!Number.isFinite(o.vat)||o.vat<0))) return null;
    if(!Number.isFinite(o.grams*o.sell))return null;
    const gold = o.grams * o.sell, extra = o.total - gold, vat = o.vat > 0 ? o.vat : 0;
    const perGram = extra / o.grams, making = perGram / (1 + vat / 100);
    const resale = Number.isFinite(o.buy)&&o.buy>0&&Number.isFinite(o.grams*o.buy) ? o.grams * o.buy : null;
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
  function percentageSuffix(value, format) {
    return Number.isFinite(value) ? ' (' + format(value) + '%)' : ' (النسبة غير متاحة)';
  }
  // Headline value of the wallet. With no valued pieces it is 0 only when the account has nothing; unpriced pieces make it unknown, never 0.
  const walletNowText = (items, unpriced, showNow, text) => (items ? (showNow ? text : '—') : (unpriced ? '—' : '0 جنيه'));
  // Plain-language notes for the wallet totals. Gross recorded weight, net resale weight, market value and gain/loss are kept apart, and each says which pieces it covers.
  function walletNotes(a, egp) {
    const weight = !a.count || a.netCount === a.count ? '' : 'الوزن المعروض هو الوزن المسجّل للقطع كلها. ' + (a.netCount ? 'وزن الذهب الصافي المعروف: ' + a.netGrams + ' جم (' + a.netCount + ' من ' + a.count + ' قطعة).' : 'وزن الذهب الصافي لسه غير معروف: محتاج تحدد بفصوص ولا بدون فصوص.');
    const diffScope = a.diff !== null && a.covered < a.count ? ' (على ' + a.covered + ' من ' + a.count + ' قطعة)' : '';
    let cover = '';
    if (a.count) {
      if (!a.valued) cover = 'القيمة لسه ما اتحسبتش: لازم نعرف القطع بفصوص ولا بدون فصوص. قطعك محفوظة زي ما هي، ومفيش ذهب ضاع ولا قيمته صفر.';
      else cover = 'القيمة تشمل ' + a.valued + ' من ' + a.count + ' قطعة معروف وزنها الصافي. ' + (a.covered ? 'الربح أو الخسارة محسوب على ' + a.covered + ' قطعة معروف سعر شرائها وقيمتها بس (' + egp(a.paidCovered) + ' من ' + egp(a.paidAll) + ' مدفوع).' : 'الربح أو الخسارة غير متاح: مفيش قطعة معروف سعر شرائها وقيمتها.') + (a.partial ? ' ⚠ الإجمالي جزئي، والباقي بيدخل بعد ما تحدد بفصوص ولا بدون.' : '');
    }
    return { weight, diffScope, cover };
  }
  if (typeof module !== 'undefined') module.exports = { prices, inspect, wallet, percentageSuffix, walletNowText, walletNotes };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
  const num = v => { const s = String(v == null ? '' : v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,\s]/g, '').replace(/٫/g, '.'); return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; };
  const nf = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d }) : '—';
  const egp = (v, d = 0) => Number.isFinite(v) ? nf(v, d) + ' جنيه' : '—';
  const signed = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d);
  const usable = q => window.DHB_QUOTE.assess(q).usable;
  const when = v => new Date(v).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  let last = null;
  const local = () => last && usable(last.sources.isagha) ? last.sources.isagha : null;

  /* ---------- invoice check ---------- */
  function invoice() {
    if (!$('invOut')) return;
    const a = local(), k = $('invKarat').value, p = a ? prices(a, k) : null;
    if (!$('invPrice').dataset.edited) $('invPrice').value = p ? Math.round(p.sell * 100) / 100 : '';
    set('invQuoteStatus',($('invPrice').dataset.edited?'تقسيم الفاتورة بسعر أدخلته بنفسك ليوم الشراء، وليس سعرًا حيًا. ':'')+'تقييم إعادة البيع الآن: '+window.DHB_QUOTE.describe(last?.sources?.isagha));
    const sell = num($('invPrice').value);
    const r = inspect({ sell, buy: p ? p.buy : NaN, grams: num($('invGrams').value), total: num($('invTotal').value), vat: $('invVat').value.trim()?num($('invVat').value):0 });
    set('invNote', $('invPrice').dataset.edited ? 'الحساب بسعر الجرام الذي أدخلته.' : a ? 'الحساب بسعر الجرام المعروض.' : 'في انتظار السعر؛ تقدر تكتب سعر الجرام يوم الشراء بنفسك.');
    const share = r && !r.belowGold ? Math.min(100, Math.max(0, r.extraPercent)) : 0, donut = $('invDonut');
    if (donut) { donut.style.strokeDasharray = share + ' ' + (100 - share); set('invDonutPct', r && !r.belowGold ? nf(r.extraPercent, 1) + '%' : '—'); }
    const v = $('invVerdict');
    if (!r) { v.textContent = 'اكتب الوزن والمبلغ لتظهر النتيجة'; v.className = 'x-verdict'; ['invGold', 'invExtra', 'invPerGram', 'invMaking', 'invTax', 'invResale', 'invLoss'].forEach(id => set(id, '—')); set('invSplitNote', ''); return; }
    if (r.belowGold) { v.textContent = 'المبلغ أقل من قيمة الذهب بهذا السعر. راجع الوزن أو العيار أو سعر الجرام.'; v.className = 'x-verdict warn'; }
    else { v.textContent = 'دفعت ' + egp(r.extra) + ' فوق قيمة الذهب'; v.className = 'x-verdict'; }
    set('invGold', egp(r.gold)); set('invExtra', egp(r.extra) + ' (' + nf(r.extraPercent, 1) + '%)'); set('invPerGram', egp(r.extraPerGram, 2));
    const vatBlank = $('invVat').value.trim() === '', vatPct = num($('invVat').value);
    // Blank VAT stays unknown: the split is not shown. A typed percentage (including 0) gives a conditional split, stated next to it.
    set('invMaking', r.belowGold ? '—' : vatBlank ? 'غير مفصول' : egp(r.makingPerGram, 2)); set('invTax', r.belowGold ? '—' : vatBlank ? 'غير محدد' : egp(r.taxPerGram, 2));
    set('invSplitNote', r.belowGold ? '' : vatBlank ? 'المؤكد من الأرقام هو الزيادة الكلية فقط. لم تكتب نسبة ضريبة، فلا نعرف كم منها مصنعية أو ضريبة أو رسوم أخرى.' : 'هذا التقسيم افتراض: يحسب كل الزيادة على أنها مصنعية مضافًا إليها ضريبة بنسبة ' + nf(vatPct, vatPct % 1 ? 2 : 0) + '% على المصنعية فقط، من غير أي رسوم أخرى. لو الفاتورة فيها بنود غير ذلك، تتغير الأرقام.');
    set('invResale', r.resale === null ? 'غير متاح' : egp(r.resale)); set('invLoss', r.loss === null ? '—' : (r.loss<0?'زيادة ':'نقص ')+egp(Math.abs(r.loss))+' ('+nf(Math.abs(r.lossPercent),1)+'%)');
  }
  if ($('invOut')) {
    ['invKarat', 'invGrams', 'invTotal', 'invVat'].forEach(id => $(id).addEventListener('input', () => { if (id === 'invKarat') delete $('invPrice').dataset.edited; invoice(); }));
    $('invPrice').addEventListener('input', () => { $('invPrice').dataset.edited = '1'; invoice(); });
    $('invReset').addEventListener('click',()=>{['invGrams','invTotal','invVat'].forEach(id=>$(id).value='');delete $('invPrice').dataset.edited;invoice();$('invGrams').focus();});
    invoice();
  }

  /* ---------- my gold ---------- */
  const KEY = 'dhb-wallet-v1';
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v.filter(i => i && PURITY[i.k] && Number.isFinite(i.g) && i.g > 0 && Number.isFinite(i.paid) && i.paid >= 0) : []; } catch (_) { return []; } };
  const save = items => { try { localStorage.setItem(KEY, JSON.stringify(items)); return true; } catch (_) { return false; } };
  function piece(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }
  // Pieces saved in the account come from wallet-account.js. Device pieces already moved to the account are shown once.
  function allItems() {
    const cloud = Array.isArray(window.DHB_CLOUD_ITEMS) ? window.DHB_CLOUD_ITEMS : [], ids = new Set(cloud.map(i => i.id));
    return cloud.map(i => Object.assign({}, i, { where: 'account' })).concat(load().filter(i => !ids.has(i.id)).map(i => Object.assign({}, i, { where: 'device' })));
  }
  let openKey = '';
  function walletRender() {
    if (!$('walRows')) return;
    set('walQuoteStatus','تقدير قيمة دهبك بسعر شراء التاجر منك • '+window.DHB_QUOTE.describe(last?.sources?.isagha));
    const items = allItems(), isg = local(), L = window.DHB_LEDGER, body = $('walRows');
    const pm = {}; ['18', '21', '24'].forEach(k => { const p = prices(isg, k); if (p) pm[k] = p; });
    const recOf = it => it.rec || { id: it.id, karat: Number(it.k), grams: it.g, paid: it.paid, label: it.note }; // device rows have no stones choice: not counted
    const recs = items.map(recOf), agg = L.aggregate(recs, pm);
    body.replaceChildren();
    const unp = (window.DHB_CLOUD_UNPRICED || []).length; $('walEmpty').hidden = items.length > 0 || unp > 0; $('walTable').hidden = items.length === 0;
    const WHY = { 'stones-unset': 'لسه ما حددتش بفصوص ولا بدون، فمش داخلة في القيمة', 'gold-weight-unknown': 'وزن الذهب الصافي غير معروف، فمش داخلة في القيمة', 'stones-cost-unknown': 'تكلفة الفصوص غير معروفة', 'legacy-additions': 'فيها مبلغ "إضافات" قديم محفوظ، فالمقارنة بسعر الذهب فقط مش متاحة', 'fees-missing': 'مصنعية أو ضريبة أو دمغة غير مسجلة', 'no-market-price': 'في انتظار السعر', 'no-price': 'سعر الشراء غير مسجل', 'non-positive-gold': 'الأرقام المسجلة مش منطقية، راجعها' };
    const dateOf = ix => (/^\d{4}-\d{2}-\d{2}$/.test(recs[ix].purchaseDate || '') ? recs[ix].purchaseDate : '');
    const invs = {}; (Array.isArray(window.DHB_CLOUD_INVOICES) ? window.DHB_CLOUD_INVOICES : []).forEach(v => { if (v && v.id) invs[v.id] = v; });
    const keyOf = ix => (items[ix].where === 'device' ? 'dev:' : '') + (recs[ix].invoiceId ? 'i:' + recs[ix].invoiceId : 'd:' + dateOf(ix));
    const groups = []; const gm = {};
    items.forEach((_, ix) => { const k = keyOf(ix); if (!gm[k]) { gm[k] = { k, date: dateOf(ix), ix: [] }; groups.push(gm[k]); } gm[k].ix.push(ix); });
    groups.sort((a, b) => (a.date === b.date ? 0 : !a.date ? 1 : !b.date ? -1 : a.date < b.date ? 1 : -1));
    const sumLine = (sel) => { const a = L.aggregate(sel.map(ix => recs[ix]), pm); return (a.approx ? '≈ ' : '') + nf(a.grams, 3) + ' جم' + (a.approx ? ' (تقريبي)' : '') + ' • ' + (a.pricedCount ? 'دفعت ' + egp(a.paidAll) + (a.unpriced ? ' (+ ' + a.unpriced + ' بدون سعر)' : '') : 'سعر الشراء غير معروف'); };
    const heading = (title, sel) => { const h = document.createElement('div'); h.className = 'yr'; h.append(piece('b', '', title), piece('span', '', ' • ' + sumLine(sel))); body.append(h); };
    const imgUse = {}; recs.forEach(x => { if (x && x.invoiceImage) imgUse[x.invoiceImage.id] = (imgUse[x.invoiceImage.id] || 0) + 1; });
    const TN = { bar: 'سبيكة', coin: 'جنيه', jewelry: 'مصوغات', scrap: 'كسر' };
    const f2 = v => Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const feeTag = (l, v) => { const s = document.createElement('span'); s.className = 'tg' + (v === undefined ? ' u' : ''); s.textContent = l + ': ' + (v === undefined ? 'غير مسجلة' : v === 0 ? 'بدون' : f2(v) + ' جنيه'); return s; };
    const mkBtn = (txt, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
    let curYear = null;
    groups.forEach(g => {
      const yr = g.date ? g.date.slice(0, 4) : '';
      if (yr !== curYear) { curYear = yr; heading(yr ? 'سنة ' + yr : 'من غير تاريخ شراء', groups.filter(x => (x.date ? x.date.slice(0, 4) : '') === yr).flatMap(x => x.ix)); }
      const meta = g.k.startsWith('i:') ? invs[g.k.slice(2)] : null, cloud = items[g.ix[0]].where === 'account';
      const card = document.createElement('div'); card.className = 'inv';
      const tag = meta ? (meta.vatMode === 'has' && Number.isFinite(meta.total) ? 'إجمالي ' + f2(meta.total) : meta.vatMode === 'none' ? 'بدون ضريبة' : 'الضريبة غير معروفة') : (cloud ? '' : 'على جهازك');
      const hd = document.createElement('header'); hd.append(piece('span', '', g.date ? L.dmy(g.date) : 'من غير تاريخ'), piece('span', '', tag)); card.append(hd);
      const cols = document.createElement('div'); cols.className = 'cols'; ['النوع', 'عيار', 'جرام', 'دفعت (جنيه)'].forEach(t => cols.append(piece('span', '', t))); card.append(cols);
      g.ix.forEach(ix => {
        const r = items[ix], rec = recs[ix], v = L.valuation(rec, pm), q = L.qtyOf(rec), key = g.k + '|' + r.id, isOpen = openKey === key;
        const row = document.createElement('button'); row.type = 'button'; row.className = 'pr'; row.setAttribute('aria-expanded', String(isOpen));
        const gs = piece('span', 'g', ''); if (q > 1) { gs.append(q + ' × ' + nf(L.unitGramsOf(rec), 3)); const sm = piece('small', '', '= ' + nf(r.g, 3)); sm.style.cssText = 'display:block;font-size:12px;color:#a9b8d0'; gs.append(sm); } else gs.textContent = nf(r.g, 3);
        row.append(piece('span', 'n', TN[rec.type] || (r.note || 'ذهب')), piece('span', 'k', String(r.k)), gs, (Number.isFinite(r.paid) ? piece('span', 'p', f2(r.paid)) : piece('span', 'p u0', 'غير معروف')));
        row.addEventListener('click', () => { openKey = isOpen ? '' : key; walletRender(); });
        card.append(row);
        if (!isOpen) return;
        const more = document.createElement('div'); more.className = 'more'; const tags = document.createElement('div'); tags.className = 'tagrow';
        tags.append(piece('span', 'tg', rec.stones === 'with' ? 'بفصوص' : rec.stones === 'without' ? 'بدون فصوص' : 'الفصوص غير محددة'), feeTag('المصنعية' + (q > 1 ? ' (للـ ' + q + ' كلهم)' : ''), rec.making), feeTag('الدمغة' + (q > 1 ? ' (للـ ' + q + ' كلهم)' : ''), rec.stamp)); more.append(tags);
        if (r.note) more.append(piece('div', '', r.note));
        more.append(piece('div', '', (cloud ? 'في حسابك' : 'على جهازك') + (Math.abs(r.g * 1000 - Math.round(r.g * 1000)) > 1e-6 ? ' • المحفوظ بالظبط: \u2066' + r.g + '\u2069 جرام' : '')));
        more.append(piece('div', '', v.B ? 'قيمة الذهب بسعر شراء التاجر: ' + egp(v.B.value) + (v.B.diff === null ? ' • الربح أو الخسارة غير متاح: سعر الشراء غير معروف' : ' (' + signed(v.B.diff) + percentageSuffix(v.B.percent, x => signed(x, 1)) + ')') : WHY[v.whyNoB] || ''));
        if (v.A) more.append(piece('div', '', 'سعر جرام الذهب وقت الشراء ' + egp(v.A.perGram, 0) + '، بسعر البيع الآن تغيّر ' + signed(v.A.percent, 1) + '%'));
        if (v.promise) more.append(piece('div', '', 'لو البائع التزم بوعده: ' + egp(v.promise.value) + ' (وعد البائع مش مضمون، وما اتحسبش في الإجمالي)'));
        if (rec.invoiceImage && imgUse[rec.invoiceImage.id] > 1) more.append(piece('div', '', 'من نفس صورة الفاتورة: ' + imgUse[rec.invoiceImage.id] + ' قطع'));
        const acts = document.createElement('div'); acts.className = 'acts';
        if (cloud && rec.stones === undefined && window.DHB_CLOUD_CLASSIFY) acts.append(mkBtn('بدون فصوص', 'القطعة بدون فصوص', () => window.DHB_CLOUD_CLASSIFY(r.id, 'without')), mkBtn('بفصوص', 'القطعة بفصوص', () => window.DHB_CLOUD_CLASSIFY(r.id, 'with')));
        if (cloud && rec.invoiceImage && window.DHB_INV_VIEW) acts.append(mkBtn('عرض الفاتورة', 'عرض صورة الفاتورة', () => window.DHB_INV_VIEW(rec.invoiceImage.id, false)), mkBtn('تنزيل الفاتورة', 'تنزيل صورة الفاتورة', () => window.DHB_INV_VIEW(rec.invoiceImage.id, true, 'invoice-' + (rec.purchaseDate || ''))),
          mkBtn('حذف الصورة', 'حذف صورة الفاتورة من السطر', () => { if (confirm('حذف صورة الفاتورة من السطر؟ القطعة نفسها هتفضل.')) window.DHB_INV_DELETE(r.id, JSON.parse(JSON.stringify(r.rec))); }));
        if (cloud && r.rec && !Number.isFinite(r.paid) && window.DHB_CLOUD_EDIT) acts.append(mkBtn('أضف سعر الشراء', 'إضافة سعر الشراء لهذه القطعة', () => window.DHB_CLOUD_EDIT(r.id)));
        if (cloud && r.rec && window.DHB_CLOUD_EDIT) acts.append(mkBtn('تعديل', 'تعديل هذه القطعة', () => window.DHB_CLOUD_EDIT(r.id)));
        acts.append(mkBtn('حذف', 'حذف هذه القطعة', () => {
          if (!confirm(cloud ? 'حذف هذه القطعة من حسابك؟' : 'حذف هذه القطعة من دهبي؟')) return;
          if (cloud) { if (window.DHB_CLOUD_DELETE) window.DHB_CLOUD_DELETE(r.id, r.rec ? JSON.parse(JSON.stringify(r.rec)) : undefined); return; }
          save(load().filter(i => i.id !== r.id)); walletRender();
        }));
        more.append(acts); card.append(more);
      });
      // Whole-invoice footer: tax, making, stamp as recorded. Unknown is never shown or summed as zero.
      const rs = g.ix.map(ix => recs[ix]), cover = k => { const vals = rs.map(x => x[k]), nums = vals.filter(x => Number.isFinite(x)); if (!nums.length) return '<b class="u0">غير مسجلة</b>'; if (nums.every(x => x === 0) && nums.length === vals.length) return '<b>بدون</b>'; return '<b>' + f2(nums.reduce((a, x) => a + Math.round(x * 100), 0) / 100) + '</b> جنيه (' + nums.length + ' من ' + vals.length + ' سطور)'; };
      let taxL; if (meta && meta.vatMode === 'has') taxL = 'قبل الضريبة: <b>' + f2(meta.subtotal) + '</b> جنيه<br>الضريبة: <b>' + f2(meta.vat) + '</b> جنيه<br>بعد الضريبة: <b>' + f2(meta.total) + '</b> جنيه'; else if (meta && meta.vatMode === 'none') taxL = 'الضريبة: <b>بدون ضريبة</b>'; else taxL = 'الضريبة: ' + (rs.some(x => Number.isFinite(x.tax)) ? cover('tax') : '<b class="u0">غير مسجلة</b>');
      let rcL = ''; if (meta && Number.isFinite(meta.total)) { const rc = L.reconcile(meta.total, rs.map(x => ({ paid: x.paid }))); rcL = rc.state === 'match' ? '<br><span class="sh2">مجموع القطع يساوي إجمالي الفاتورة</span>' : rc.state === 'diff' ? '<br><span class="u0">الفرق بين إجمالي الفاتورة ومجموع القطع: <b>' + f2(Math.abs(rc.diff)) + '</b> جنيه (مش متقسّم على القطع)</span>' : ''; }
      const ft = document.createElement('p'); ft.className = 'invf'; ft.innerHTML = '<span class="sh2">الفاتورة كلها</span><br>' + taxL + '<br>المصنعية: ' + cover('making') + '<br>الدمغة: ' + cover('stamp') + rcL; card.append(ft);
      if (cloud && g.k.startsWith('i:') && window.DHB_CLOUD_EDIT_INVOICE) { const ea = document.createElement('div'); ea.className = 'more acts'; ea.append(mkBtn('تعديل بيانات الفاتورة', 'تعديل تاريخ الفاتورة وضريبتها', () => window.DHB_CLOUD_EDIT_INVOICE(g.k.slice(2)))); card.append(ea); }
      body.append(card);
    });
    const N = walletNotes(agg, egp), showNow = agg.valued > 0;
    set('walNow', walletNowText(items.length, 0, showNow, showNow ? egp(agg.now) : ''));
    set('walPaid', items.length && agg.pricedCount ? egp(agg.paidAll) : '—');
    const pn = $('walPaidNote'); if (pn) pn.textContent = items.length && agg.pricedCount && agg.unpriced ? '(+ ' + agg.unpriced + ' بدون سعر)' : ''; // the unpriced count on its own line so the amount never wraps mid-phrase
    set('walWeight', items.length ? (agg.approx ? '≈ ' : '') + nf(agg.grams, 3) + ' جم' + (agg.approx ? ' (تقريبي)' : '') : '—');
    const d = $('walDiff'); d.textContent = agg.diff === null ? '' : signed(agg.diff) + percentageSuffix(agg.percent, x => signed(x, 1)); d.className = 'chg' + (agg.diff === null ? '' : agg.diff >= 0 ? ' up' : ' dn');
    const sc = $('walScope'); if (sc) sc.textContent = agg.diff === null ? '' : N.diffScope.replace(/^ \(|\)$/g, ''); // which pieces the gain covers: its own readable line, so the number fit never shrinks it
    set('walGrams', items.length && !Object.keys(pm).length ? 'في انتظار السعر.' : N.weight);
    set('walCover', items.length ? N.cover : '');
  }
  if ($('walRows')) {
    window.DHB_WALLET_RENDER = walletRender; // the add form is handled by wallet-account.js: saving needs an account
    $('walForm').addEventListener('submit', e => e.preventDefault());
    walletRender();
  }

  /* ---------- share card ---------- */
  function img(src) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); }
  async function card() {
    const a = local(), s = last?.sources, B = window.DHB_BASE || '';
    if(!a)throw Error('Quote unavailable');
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const x = c.getContext('2d'), F = (w, px) => w + ' ' + px + 'px "IBM Plex Sans Arabic", Tahoma, sans-serif';
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#070f1e'); g.addColorStop(.5, '#12233b'); g.addColorStop(1, '#070f1e');
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    try { const bg = await img(B + 'assets/logo-900.webp'); x.globalAlpha = .09; x.drawImage(bg, 90, 300, 900, 900); x.globalAlpha = 1; } catch (_) {}
    try { const em = await img(B + 'assets/emblem.webp'); x.drawImage(em, 430, 50, 220, 220); } catch (_) {}
    x.direction = 'rtl'; x.textAlign = 'center'; x.fillStyle = '#f0ca78'; x.font = F(700, 76); x.fillText('دهبولوجي', 540, 350);
    x.fillStyle = '#d8e3f0'; x.font = F(600, 38); x.fillText('سعر الذهب في مصر', 540, 415);
    if(!usable(a))throw Error('Quote expired');
    const rows = [['عيار 21', '21'], ['عيار 24', '24'], ['عيار 18 (محسوب)', '18']];
    rows.forEach((r, i) => {
      const p = prices(a, r[1]), y = 480 + i * 190;
      x.fillStyle = '#102139'; x.strokeStyle = '#e7bf67'; x.lineWidth = 2; x.beginPath(); x.roundRect(70, y, 940, 160, 26); x.fill(); x.stroke();
      x.textAlign = 'right'; x.fillStyle = '#ffffff'; x.font = F(700, 46); x.fillText(r[0], 970, y + 68);
      x.fillStyle = '#b4c4d8'; x.font = F(600, 32); x.fillText('شراء التاجر منك: ' + nf(p.buy), 970, y + 122);
      x.textAlign = 'left'; x.fillStyle = '#f3dcaa'; x.font = F(700, 78); x.fillText(nf(p.sell), 110, y + 100);
    });
    x.textAlign = 'center'; x.fillStyle = '#d8e3f0'; x.font = F(600, 36);
    x.font=F(500,23);
    const extras=[];
    {const fx=window.DHB_QUOTE.reference(s);if(fx)extras.push('المركزي (مرجع بيع مؤرّخ) '+nf(fx.sell)+' • '+fx.quoteDate);}
    if(usable(s.gold)&&Number.isFinite(s.gold.sell))extras.push('الأونصة '+nf(s.gold.sell)+' $ • '+window.DHB_QUOTE.when(s.gold.sourceTime)+' القاهرة');
    extras.forEach((text,i)=>x.fillText(text,540,1080+i*32));
    x.fillStyle='#e7bf67';x.font=F(600,25);
    x.fillText('وقت تسعيرة الذهب: '+window.DHB_QUOTE.when(a.sourceTime)+' القاهرة',540,1160);
    x.fillText(window.DHB_QUOTE.describe(a),540,1198);
    x.fillStyle='#acbdd2';x.font=F(500,23);
    x.fillText('إنشاء الصورة: '+window.DHB_QUOTE.when(new Date().toISOString())+' القاهرة',540,1235);
    x.fillText('سعر الجرام بالجنيه بدون مصنعية'+(last.transport?.mode==='cache'?(last.transport.offline?' • غير متصل؛ بيانات محفوظة':' • بيانات محفوظة'):last.transport?.mode!=='network'?' • الاتصال غير متحقق':''),540,1270);
    x.fillStyle='#e7bf67';x.font=F(700,28);x.fillText(location.host+(B==='/'?'':B.replace(/\/$/,'')),540,1320);
    if(!usable(a))throw Error('Quote expired');
    return (await fetch(c.toDataURL('image/png'))).blob();
  }
  const share = $('shareBtn');
  if (share) share.addEventListener('click', async () => {
    if (!local()) { set('shareMsg', 'السعر غير متاح الآن؛ جرّب لاحقًا.'); return; }
    share.disabled = true; set('shareMsg', 'تجهيز الصورة…');
    try {
      const blob = await card(), file = new File([blob], 'dahabology-gold-price.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'سعر الذهب اليوم — دهبولوجي' }); set('shareMsg', ''); }
      else { const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = file.name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); set('shareMsg', 'اتحفظت الصورة على جهازك.'); }
    } catch (e) { set('shareMsg', e && e.name === 'AbortError' ? '' : 'تعذر تجهيز الصورة على هذا المتصفح.'); }
    share.disabled = false;
  });
  window.DHB_CARD = () => card();   // lets the card be previewed while developing

  setInterval(()=>{invoice();walletRender();},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){invoice();walletRender();}});
  window.addEventListener('gold-board-updated', e => { last = e.detail; invoice(); walletRender(); });
})();
