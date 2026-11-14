/* Dahabology calculator: buying (by money or by weight, with making charge, stamp and tax) and selling. */
(function () {
  'use strict';
  /**
   * mode 'buy': price = dealer's sell price per gram. by 'money' → grams for an amount; by 'grams' → cost of a weight.
   * mode 'sell': price = dealer's buy price per gram; amount is the weight.
   * making and stamp are per gram; vat is a percentage applied to the making charge only.
   */
  function quote(o) {
    const price = o.price, amount = o.amount;
    if (![price,amount].every(v=>Number.isFinite(v)&&v>0) || !['buy','sell'].includes(o.mode)) return null;
    if (o.mode==='buy' && ![o.making??0,o.stamp??0,o.vat??0].every(v=>Number.isFinite(v)&&v>=0)) return null;
    if(!Number.isFinite(price*amount))return null;
    if (o.mode === 'sell') return { mode: 'sell', grams: amount, gold: amount * price, total: amount * price };
    const making = o.making > 0 ? o.making : 0, stamp = o.stamp > 0 ? o.stamp : 0, vat = o.vat > 0 ? o.vat : 0;
    const tax = making * vat / 100, perGram = price + making + stamp + tax;
    const grams = o.by === 'grams' ? amount : amount / perGram;
    if(!Number.isFinite(grams*perGram))return null;
    return { mode: 'buy', grams, perGram, gold: grams * price, making: grams * making, stamp: grams * stamp, tax: grams * tax, total: grams * perGram, extra: grams * (making + stamp + tax) };
  }
  if (typeof module !== 'undefined') module.exports = { quote };
  if (typeof document === 'undefined' || !document.getElementById('cResult')) return;

  const $ = id => document.getElementById(id);
  const num = v => { const s = String(v == null ? '' : v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,\s]/g, '').replace(/٫/g, '.'); return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; };
  const nf = (v, d = 2) => v.toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d });
  const egp = v => nf(v, 2) + ' جنيه';
  const state = { mode: 'buy', by: 'money', edited: false, prices: null };

  function livePrice() {
    const p = state.prices, k = $('cKarat').value; if (!p) return NaN;
    const base = k === '18' ? p['24'] : p[k], f = k === '18' ? 18 / 24 : 1;
    return base ? (state.mode === 'buy' ? base.sell : base.buy) * f : NaN;
  }
  function fillPrice() { if (!state.edited) { const v = livePrice(); $('cPrice').value = Number.isFinite(v) ? Math.round(v * 100) / 100 : ''; } }
  function line(dl, label, value, cls) { const d = document.createElement('div'); if (cls) d.className = cls; const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; d.append(dt, dd); dl.append(d); }

  function render() {
    const buy = state.mode === 'buy', by = buy ? $('cBy').value : 'grams';
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    document.querySelectorAll('.buy-only').forEach(e => e.hidden = !buy);
    $('cPriceLabel').textContent = buy ? 'سعر بيع الجرام لك' : 'سعر شراء التاجر للجرام منك';
    $('cAmountLabel').textContent = by === 'money' ? 'المبلغ الذي معك بالجنيه' : 'الوزن بالجرام';
    $('cAmount').placeholder = by === 'money' ? 'مثال: 100000' : 'مثال: 10';
    const q = quote({ mode: state.mode, by, price: num($('cPrice').value), amount: num($('cAmount').value), making: $('cMaking').value.trim()?num($('cMaking').value):0, stamp: $('cStamp').value.trim()?num($('cStamp').value):0, vat: $('cVat').value.trim()?num($('cVat').value):0 });
    const dl = $('cBreak'); dl.replaceChildren();
    $('cExplain').textContent=!q?'اكتب المبلغ أو الوزن وسعر الجرام. الرسوم الاختيارية يجب أن تكون أرقامًا صفر أو أكبر.':q.mode==='sell'?'هذا تقدير لقيمة الذهب بسعر شراء التاجر، قبل أي خصومات عند الفحص.':'الإجمالي = قيمة الذهب + المصنعية + الدمغة والرسوم + الضريبة التي أدخلتها.';
    $('cPriceNote').textContent = state.edited ? 'الحساب بالسعر الذي أدخلته.' : state.prices ? 'الحساب بسعر الجرام المعروض' + ($('cKarat').value === '18' ? '، وعيار 18 محسوب من عيار 24.' : '.') : 'في انتظار السعر؛ تقدر تكتب السعر بنفسك.';
    if (!q) { $('cResultLabel').textContent = buy ? (by === 'money' ? 'تشتري تقريبًا' : 'التكلفة التقريبية') : 'تستلم تقريبًا'; $('cResult').textContent = '—'; return; }
    if (!buy) {
      $('cResultLabel').textContent = 'تستلم تقريبًا'; $('cResult').textContent = egp(q.total);
      line(dl, 'الوزن', nf(q.grams, 3) + ' جرام'); line(dl, 'سعر شراء التاجر للجرام', nf(num($('cPrice').value)) + ' جنيه');
      return;
    }
    $('cResultLabel').textContent = by === 'money' ? 'تشتري تقريبًا' : 'التكلفة التقريبية';
    $('cResult').textContent = by === 'money' ? nf(Math.floor(q.grams*1000)/1000, 3) + ' جرام' : egp(q.total);
    line(dl, 'الوزن', nf(q.grams, 3) + ' جرام');
    line(dl, 'قيمة الذهب نفسه', egp(q.gold));
    if (q.making) line(dl, 'المصنعية', egp(q.making));
    if (q.tax) line(dl, 'ضريبة على المصنعية', egp(q.tax));
    if (q.stamp) line(dl, 'دمغة ورسوم أخرى', egp(q.stamp));
    line(dl, 'تكلفة الجرام النهائية', nf(q.perGram) + ' جنيه');
    line(dl, 'الإجمالي', egp(q.total), 'total');
    if (q.extra) line(dl, 'رسوم فوق قيمة الذهب', egp(q.extra) + ' (' + nf(q.extra / q.total * 100, 1) + '%)');
    line(dl,'سعر شراء التاجر اللازم لتغطية التكلفة',nf(q.total/q.grams)+' جنيه / جرام');
  }

  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { if(state.mode===b.dataset.mode)return;state.mode = b.dataset.mode; $('cAmount').value='';state.edited = false; fillPrice(); render(); }));
  $('cKarat').addEventListener('change', () => { state.edited = false; fillPrice(); render(); });
  $('cPrice').addEventListener('input', () => { state.edited = true; render(); });
  $('cBy').addEventListener('input',()=>{if(state.by!==$('cBy').value){state.by=$('cBy').value;$('cAmount').value='';}render();});
  ['cAmount', 'cMaking', 'cStamp', 'cVat'].forEach(id => $(id).addEventListener('input', render));
  window.addEventListener('gold-board-updated', e => {
    const a = e.detail.sources.isagha, t = Date.parse(a && a.sourceTime);
    state.prices = a && a.status === 'available' && Number.isFinite(t) && Date.now() - t <= 86400000 && t-Date.now()<=120000 ? a : null;
    fillPrice(); render();
  });
  $('cReset').addEventListener('click',()=>{state.mode='buy';state.by='money';state.edited=false;$('cBy').value='money';$('cKarat').value='21';['cAmount','cMaking','cStamp','cVat'].forEach(id=>$(id).value='');fillPrice();render();$('cKarat').dispatchEvent(new Event('input',{bubbles:true}));$('cAmount').focus();});
  render();
})();
