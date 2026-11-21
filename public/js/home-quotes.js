/* Home price cards share the same original-quote age and transport rules as tools. */
(function(){
'use strict';
const $=id=>document.getElementById(id),Q=window.DHB_QUOTE;
let sources={},transport=null,busy=false,silver=null;
const positive=v=>Number.isFinite(v)&&v>0;
function price(id,q,value,dec=2){$(id).textContent=Q.assess(q).usable&&positive(value)?value.toLocaleString('en-US',{maximumFractionDigits:dec}):'—';}
function stamp(q){const a=Q.assess(q);return a.usable?'':'التسعيرة غير متاحة أو تجاوزت 24 ساعة';}
const shortTime=v=>new Date(v).toLocaleString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
function render(){
 const g=sources.isagha,oz=sources.gold,fx=Q.reference(sources);
 price('p21',g,g?.['21']?.sell);price('p18',g,g?.['24']?.sell*18/24);price('p24',g,g?.['24']?.sell);price('pOz',oz,oz?.sell);
 $('pUsd').textContent=fx?fx.value:'—';$('pUsdLabel').textContent='الدولار بالمركزي';
 $('pUsdTime').textContent=fx?'تاريخ المرجع '+fx.quoteDate:'غير متاح · لا بديل تلقائي';
 const imp=Q.implied(sources);$('pImplied').textContent=positive(imp)?imp.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
 $('pImpliedTime').textContent=positive(imp)?'من ذهب 24 والأونصة · '+shortTime(new Date(Math.min(Date.parse(g.sourceTime),Date.parse(oz.sourceTime))))+' القاهرة':'مدخلات ناقصة أو أقدم من 24 ساعة';
 const si=window.DHB_SILVER.globalSilver(silver),sl=window.DHB_SILVER.localSilver(sources.isagha_silver),row=sl?.rows.find(r=>r.grade==='999');
 $('pSilver').textContent=si?si.ozUSD.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
 $('pSilverTime').textContent=si?'gold-api · '+shortTime(si.sourceTime)+' القاهرة':'غير متاح أو أقدم من 24 ساعة';
 $('pSilverLocal').textContent=row?row.sell.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
 $('pSilverLocalTime').textContent=row?'بيع آي صاغة · وحدة الجرام مستنتجة · '+shortTime(sl.sourceTime)+' القاهرة':'المحلي غير متاح · لا تحويل من العالمي';
 $('pWhen').textContent='السعر للجرام بدون مصنعية';$('pSourceTime').textContent=Q.assess(g).usable?'آي صاغة · '+Q.when(g.sourceTime)+' القاهرة':Q.describe(g);$('pOzTime').textContent=Q.assess(oz).usable?'gold-api · '+shortTime(oz.sourceTime)+' القاهرة':stamp(oz);
 {const c=Q.connection(transport);$('homeConnection').textContent=c?'ملف أسعار الجرام والبنك: '+c:'';}
}
async function json(url){const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return {body:await r.json(),mode:r.headers.get('X-DHB-Transport')||(navigator.serviceWorker?.controller?'unverified':'network'),online:r.headers.get('X-DHB-Online-At')};}finally{clearTimeout(timer);}}
async function refresh(){
 if(busy)return;busy=true;
 try{
 const [snapshot,global,silverResult]=await Promise.allSettled([json((window.DHB_DATA||'data/')+'quotes.json?t='+Date.now()),json('https://api.gold-api.com/price/XAU'),json('https://api.gold-api.com/price/XAG')]);
 if(snapshot.status==='fulfilled'&&snapshot.value.body.schemaVersion===1){const r=snapshot.value;sources=r.body.sources||{};transport={mode:r.mode,offline:navigator.onLine===false,lastOnline:r.online||(r.mode==='network'?new Date().toISOString():transport?.lastOnline)};}
 else transport={...transport,mode:'unavailable',offline:navigator.onLine===false};
 if(global.status==='fulfilled'){const g=global.value.body,q={status:'available',sell:Number(g.price),sourceTime:g.updatedAt};if(g.symbol==='XAU'&&(!g.currency||g.currency==='USD')&&positive(q.sell)&&Q.assess(q).usable)sources.gold=q;}
 if(silverResult.status==='fulfilled')silver=silverResult.value.body;
 render();
 }finally{busy=false;}
}
window.addEventListener('offline',()=>{transport={...transport,mode:'unavailable',offline:true};render();});
window.addEventListener('online',refresh);
setInterval(render,30000);setInterval(refresh,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
render();refresh();
})();
