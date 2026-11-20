(function () {
  'use strict';
  const OUNCE = 31.1034768;
  const validTime=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
  function calculate(ounce, bankSell, local24, local21) {
    if (![ounce, bankSell, local24].every(x => Number.isFinite(x) && x > 0)) return null;
    const gramUSD = ounce / OUNCE, globalEGP = gramUSD * bankSell;
    return { gramUSD, globalEGP, global21: globalEGP * 21 / 24,
      gapEGP: local24 - globalEGP, gapUSD: (local24 - globalEGP) / bankSell,
      gapPercent: (local24 / globalEGP - 1) * 100,
      implied: local24 / gramUSD, fxGap: local24 / gramUSD - bankSell,
      fxPercent: (local24 / gramUSD / bankSell - 1) * 100,
      drop24: Math.max(0, 7735 - local24), drop21: local21 > 0 ? Math.max(0, 6767 - local21) : null };
  }

  function assess(sources, now = Date.now()) {
    const quotes = [sources?.isagha, sources?.misr, sources?.gold];
    const times = quotes.map(q => validTime(q?.sourceTime)?Date.parse(q.sourceTime):NaN);
    if (quotes.some(q => q?.status !== 'available') || times.some(t => !Number.isFinite(t))) return {usable:false, fresh:false, reason:'المقارنة غير متاحة حاليًا.'};
    if (![sources.isagha?.['24']?.sell,sources.isagha?.['21']?.sell,sources.misr?.sell,sources.gold?.sell].every(v=>Number.isFinite(v)&&v>0)) return {usable:false,fresh:false,reason:'إحدى قيم الأسعار غير صالحة؛ المقارنة معلقة.'};
    if (times.some(t => t > now + 120000)) return {usable:false, fresh:false, reason:'المقارنة معلقة لحين التحقق.'};
    if (times.some(t => now-t > 24*3600000)) return {usable:false, fresh:false, reason:'إحدى القراءات تجاوزت 24 ساعة؛ المقارنة معلقة حتى يصل سعر أحدث.'};
    const fresh = times.every(t => now-t <= 300000) && Math.max(...times)-Math.min(...times) <= 300000;
    return {usable:true, fresh, reason:'الحساب قبل رسوم المنتج النهائي.'};
  }
  function quoteUsable(q,now=Date.now()) {const t=validTime(q?.sourceTime)?Date.parse(q.sourceTime):NaN;return q?.status==='available' && Number.isFinite(t) && t<=now+120000 && now-t<=86400000;}
  if (typeof module !== 'undefined') module.exports = {calculate, OUNCE, assess,quoteUsable};
  if (typeof document === 'undefined') return;
  const $ = id => (document.getElementById(id)||document.createElement('div'));
  const state = {sources:{}, generatedAt:null, lastCheck:null, busy:false, dealerEdited:false, transport:null};
  const number = v => { const s=String(v).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,\s]/g,'').replace(/٫/g,'.'); return /^\d+(\.\d+)?$/.test(s)?Number(s):NaN; };
  const positive = v => Number.isFinite(v) && v>0;
  const fmt = (v,unit=' جنيه') => Number.isFinite(v)?v.toLocaleString('ar-EG-u-nu-latn',{maximumFractionDigits:2})+unit:'—';
  const time = v => Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'غير متاح';
  const usable=quoteUsable;
  function cardPrice(id,quote,value,unit){const element=$(id);element.replaceChildren();if(!usable(quote)||!positive(value)){element.textContent='غير متاح';return;}element.appendChild(document.createTextNode(fmt(value,'')));const small=document.createElement('small');small.className='price-unit';small.textContent=unit;element.appendChild(small);}
  function calculator() {
    const budget=number($('budget').value), price=number($('dealer').value);
    $('grams').textContent=positive(budget)&&positive(price)?fmt(budget/price,' جرام'):'—';
    $('calculatorNote').textContent=state.dealerEdited?'الحساب بسعر التاجر الذي أدخلته؛ لا يشمل المصنعية.':'سعر الجرام لا يشمل المصنعية.';
  }
  function row(label,q,buy,sell,unit,url) {
    const tr=document.createElement('tr');
    [label,usable(q)?fmt(buy,unit):'—',usable(q)?fmt(sell,unit):'—',time(q?.sourceTime),time(q?.fetchedAt),usable(q)?'منشور':(q?.reason||'بيانات غير متاحة أو أقدم من 24 ساعة')].forEach((value,i)=>{const td=document.createElement('td');if(i===0&&url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent=value+' ↗';td.appendChild(link);}else td.textContent=value;tr.appendChild(td)});
    return tr;
  }
  function render() {
    const a=state.sources.isagha,b=state.sources.misr,g=state.sources.gold;
    cardPrice('price24',a,a?.['24']?.sell,'جنيه / جرام');
    cardPrice('price21',a,a?.['21']?.sell,'جنيه / جرام');
    cardPrice('priceBank',b,b?.sell,'جنيه / دولار');
    cardPrice('priceOunce',g,g?.sell,'دولار / أونصة');
    const quality=assess(state.sources);
    const result=quality.usable?calculate(g.sell,b.sell,a['24'].sell,a['21'].sell):null;
    const map={gapEGP:[result?.gapEGP],gapPercent:[result?.gapPercent,'%'],gapUSD:[result?.gapUSD,' دولار'],implied:[result?.implied],fxGap:[result?.fxGap],fxPercent:[result?.fxPercent,'%'],global24:[result?.globalEGP],global21:[result?.global21]};
    Object.entries(map).forEach(([id,args])=>$(id).textContent=fmt(...args));
    $('gapMeaning').textContent=result?(result.gapEGP>=0?'علاوة محلية فوق القيمة العالمية':'خصم محلي عن القيمة العالمية'):'انتظار بيانات صالحة للمقارنة — لا يلزم إدخال أسعار.';
    $('qualityBadge').textContent=result?'نتيجة المقارنة':'المقارنة معلقة';
    $('qualityBadge').className='badge'+(result&&quality.fresh?' good':'');
    $('qualityText').textContent=quality.reason;
    $('fetchStatus').textContent=(state.busy?'تحميل الأسعار… • ':'')+window.DHB_QUOTE.connection(state.transport);
    if (!state.dealerEdited) $('dealer').value=usable(a)?a['21'].sell:'';
    calculator();
    if($('reference24'))$('reference24').textContent=result?fmt(result.drop24)+' ('+fmt(result.drop24/7735*100,'%')+')':'—';
    if($('reference21'))$('reference21').textContent=result?fmt(result.drop21)+' ('+fmt(result.drop21/6767*100,'%')+')':'—';
    window.dispatchEvent(new CustomEvent('gold-board-updated',{detail:{sources:state.sources,quality,result,transport:state.transport}}));
  }
  async function json(url) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
    try {const r=await fetch(url,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);const value=await r.json();if(value&&typeof value==='object')value._dhbTransport={mode:r.headers.get('X-DHB-Transport')||((navigator.serviceWorker&&navigator.serviceWorker.controller)?'unverified':'network'),lastOnline:r.headers.get('X-DHB-Online-At')||null};return value;}finally{clearTimeout(timer);}
  }
  async function refresh() {
    if(state.busy)return;
    state.busy=true;$('refresh').disabled=true;render();
    const quotesURL=(window.DHB_DATA||'data/')+'quotes.json';
    const [snapshot,global]=await Promise.allSettled([json(quotesURL+'?t='+Date.now()),json('https://api.gold-api.com/price/XAU')]);
    const previousGold=state.sources.gold;
    if(snapshot.status==='fulfilled'&&snapshot.value.schemaVersion===1) {
      state.sources=snapshot.value.sources||{};state.generatedAt=snapshot.value.generatedAt;
      const observed=snapshot.value._dhbTransport;
      state.transport={mode:observed.mode,offline:navigator.onLine===false,lastOnline:observed.lastOnline||(observed.mode==='network'?new Date().toISOString():state.transport?.lastOnline)};
      if(state.transport.lastOnline)try{localStorage.setItem('dhb-last-online',state.transport.lastOnline);}catch(_){}
    } else {
      // Keep visible previous values and their real timestamps, never relabel as new.
      state.sources={...state.sources};
      let prior=state.transport?.lastOnline;try{prior=prior||localStorage.getItem('dhb-last-online');}catch(_){}
      state.transport={mode:'unavailable',offline:navigator.onLine===false,lastOnline:prior};
    }
    if(!state.sources.gold&&previousGold)state.sources.gold=previousGold;
    if(global.status==='fulfilled'&&global.value.symbol==='XAU'&&(!global.value.currency||global.value.currency==='USD')&&positive(Number(global.value.price))&&Number.isFinite(Date.parse(global.value.updatedAt))) {
      state.sources.gold={status:'available',sell:Number(global.value.price),sourceTime:global.value.updatedAt,fetchedAt:new Date().toISOString(),name:'gold-api.com',sourceTimeKind:'provider_upstream_fetch'};
    }
    state.lastCheck=new Date().toISOString();state.busy=false;$('refresh').disabled=false;render();

  }
  $('refresh').addEventListener('click',refresh);
  $('budget').addEventListener('input',calculator);
  $('dealer').addEventListener('input',()=>{state.dealerEdited=true;calculator();});
  window.addEventListener('offline',()=>{state.transport={...state.transport,mode:'unavailable',offline:true};render();});
  setInterval(render,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
  setInterval(refresh,60000);refresh();
})();
