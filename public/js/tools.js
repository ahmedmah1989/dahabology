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
  if (typeof module !== 'undefined') module.exports = { prices, inspect, wallet, percentageSuffix };
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
    if (!r) { v.textContent = 'اكتب الوزن والمبلغ لتظهر النتيجة'; v.className = 'x-verdict'; ['invGold', 'invExtra', 'invPerGram', 'invMaking', 'invTax', 'invResale', 'invLoss'].forEach(id => set(id, '—')); return; }
    if (r.belowGold) { v.textContent = 'المبلغ أقل من قيمة الذهب بهذا السعر. راجع الوزن أو العيار أو سعر الجرام.'; v.className = 'x-verdict warn'; }
    else { v.textContent = 'دفعت ' + egp(r.extra) + ' فوق قيمة الذهب'; v.className = 'x-verdict'; }
    set('invGold', egp(r.gold)); set('invExtra', egp(r.extra) + ' (' + nf(r.extraPercent, 1) + '%)'); set('invPerGram', egp(r.extraPerGram, 2));
    set('invMaking', r.belowGold ? '—' : egp(r.makingPerGram, 2)); set('invTax', r.belowGold ? '—' : egp(r.taxPerGram, 2));
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
  function walletRender() {
    if (!$('walRows')) return;
    set('walQuoteStatus','تقدير قيمة دهبك بسعر شراء التاجر منك • '+window.DHB_QUOTE.describe(last?.sources?.isagha));
    const items = allItems(), isg = local(), L = window.DHB_LEDGER, body = $('walRows');
    const pm = {}; ['18', '21', '24'].forEach(k => { const p = prices(isg, k); if (p) pm[k] = p; });
    const recOf = it => it.rec || { id: it.id, karat: Number(it.k), grams: it.g, paid: it.paid, label: it.note }; // device rows have no stones choice: not counted
    const recs = items.map(recOf), agg = L.aggregate(recs, pm);
    body.replaceChildren();
    $('walEmpty').hidden = items.length > 0; $('walTable').hidden = items.length === 0;
    const WHY = { 'stones-unset': 'لسه ما حددتش بفصوص ولا بدون، فمش داخلة في القيمة', 'gold-weight-unknown': 'وزن الذهب الصافي غير معروف، فمش داخلة في القيمة', 'stones-cost-unknown': 'تكلفة الفصوص غير معروفة', 'legacy-additions': 'فيها مبلغ "إضافات" قديم محفوظ، فالمقارنة بسعر الذهب فقط مش متاحة', 'fees-missing': 'مصنعية أو ضريبة أو دمغة غير مسجلة', 'no-market-price': 'في انتظار السعر', 'no-price': 'سعر الشراء غير مسجل', 'non-positive-gold': 'الأرقام المسجلة مش منطقية، راجعها' };
    items.forEach((r, ix) => {
      const rec = recs[ix], v = L.valuation(rec, pm), cloud = r.where === 'account';
      const it = document.createElement('div'); it.className = 'x-item wl';
      const mk = (txt, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'wal-del'; b.textContent = txt; b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
      const del = mk('حذف', 'حذف هذه القطعة', () => {
        if (!confirm(cloud ? 'حذف هذه القطعة من حسابك؟' : 'حذف هذه القطعة من دهبي؟')) return;
        if (cloud) { if (window.DHB_CLOUD_DELETE) window.DHB_CLOUD_DELETE(r.id, r.rec ? JSON.parse(JSON.stringify(r.rec)) : undefined); return; }
        save(load().filter(i => i.id !== r.id)); walletRender();
      });
      const st = rec.stones === 'with' ? ' • بفصوص' : rec.stones === 'without' ? ' • بدون فصوص' : '';
      it.append(
        piece('b', '', (r.note || 'ذهب') + ' • عيار ' + r.k + (cloud ? ' • في حسابك' : ' • على جهازك') + st), piece('span', 'v', v.B ? egp(v.B.value) : '—'),
        piece('span', 'w', (rec.purchaseDate ? L.dmy(rec.purchaseDate) + ' • ' : '') + nf(r.g, 3) + ' جرام • دفعت ' + egp(r.paid)),
        piece('span', 'd' + (v.B ? (v.B.diff >= 0 ? ' up' : ' dn') : ''), v.B ? 'قيمة الذهب بسعر شراء التاجر: ' + signed(v.B.diff) + percentageSuffix(v.B.percent, x => signed(x, 1)) : WHY[v.whyNoB] || ''));
      if (v.A) it.append(piece('span', 'w', 'سعر جرام الذهب وقت الشراء ' + egp(v.A.perGram, 0) + '، بسعر البيع الآن تغيّر ' + signed(v.A.percent, 1) + '%'));
      else if (v.whyNoA && v.whyNoA !== v.whyNoB && WHY[v.whyNoA]) it.append(piece('span', 'w', 'مقارنة سعر الجرام: ' + WHY[v.whyNoA]));
      if (v.promise) it.append(piece('span', 'w', 'لو البائع التزم بوعده: ' + egp(v.promise.value) + ' (وعد البائع مش مضمون، وما اتحسبش في الإجمالي)'));
      const acts = document.createElement('div'); acts.className = 'acts';
      if (cloud && rec.stones === undefined && window.DHB_CLOUD_CLASSIFY) {
        acts.append(mk('بدون فصوص', 'القطعة بدون فصوص', () => window.DHB_CLOUD_CLASSIFY(r.id, 'without')), mk('بفصوص', 'القطعة بفصوص', () => window.DHB_CLOUD_CLASSIFY(r.id, 'with')));
      }
      if (cloud && r.rec && window.DHB_CLOUD_EDIT) acts.append(mk('تعديل', 'تعديل هذه القطعة', () => window.DHB_CLOUD_EDIT(r.id)));
      acts.append(del); it.append(acts); body.append(it);
    });
    const showNow = agg.covered > 0;
    set('walNow', items.length ? (showNow ? egp(agg.now) : '—') : '0 جنيه');
    set('walPaid', items.length ? egp(agg.paidAll) : '—');
    set('walWeight', items.length ? nf(agg.grams, 3) + ' جم' : '—');
    const d = $('walDiff'); d.textContent = agg.diff === null ? '' : signed(agg.diff) + percentageSuffix(agg.percent, x => signed(x, 1)); d.className = 'chg' + (agg.diff === null ? '' : agg.diff >= 0 ? ' up' : ' dn');
    set('walGrams', items.length && !Object.keys(pm).length ? 'في انتظار السعر.' : '');
    set('walCover', !items.length ? '' : agg.covered === 0 ? 'القيمة لسه ما اتحسبتش: محتاجين نعرف القطع بفصوص ولا بدون فصوص. قطعك وأسعار شرائها محفوظة زي ما هي، ومفيش ذهب ضاع ولا قيمته صفر.'
      : 'دخل ' + agg.covered + ' من ' + agg.count + ' قطعة في القيمة، والفرق محسوب على اللي دفعته فيهم بس (' + egp(agg.paidCovered) + ' من ' + egp(agg.paidAll) + '). باقي القطع محفوظة بأسعارها، وبتدخل بعد ما تحدد بفصوص ولا بدون.' + (agg.partial ? ' ⚠ الإجمالي جزئي.' : ''));
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
    if(usable(s.misr)&&Number.isFinite(s.misr.sell))extras.push('دولار البنك '+nf(s.misr.sell)+' • '+window.DHB_QUOTE.when(s.misr.sourceTime)+' القاهرة');
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
