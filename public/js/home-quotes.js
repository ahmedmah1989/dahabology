/* Home price cards share the same original-quote age and transport rules as tools. */
(function(){
'use strict';
const $=id=>document.getElementById(id),Q=window.DHB_QUOTE;
let sources={},transport=null,busy=false;
const positive=v=>Number.isFinite(v)&&v>0;
function price(id,q,value,dec=2){$(id).textContent=Q.assess(q).usable&&positive(value)?value.toLocaleString('en-US',{maximumFractionDigits:dec}):'—';}
function stamp(q){const a=Q.assess(q);return a.usable?'':'التسعيرة غير متاحة أو تجاوزت 24 ساعة';}
function render(){
 const g=sources.isagha,m=sources.misr,oz=sources.gold;
 price('p21',g,g?.['21']?.sell,0);price('p24',g,g?.['24']?.sell);price('pUsd',m,m?.sell);{const o=Q.official(sources.cbe);$('pUsdLabel').textContent=o?o.label:'الدولار في البنك';if(o)$('pUsd').textContent=o.value;}price('pOz',oz,oz?.sell);
 $('pWhen').textContent='السعر للجرام بدون مصنعية';$('pSourceTime').textContent=Q.describe(g);
 {const o=Q.official(sources.cbe);$('pUsdTime').textContent=o?o.text:(Q.assess(m).usable?'':(Q.lastPublished(m,'بنك مصر','جنيه للدولار')||stamp(m)));}$('pOzTime').textContent=stamp(oz);
 {const c=Q.connection(transport);$('homeConnection').textContent=c?'ملف أسعار الجرام والبنك: '+c:'';}
}
async function json(url){const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return {body:await r.json(),mode:r.headers.get('X-DHB-Transport')||(navigator.serviceWorker?.controller?'unverified':'network'),online:r.headers.get('X-DHB-Online-At')};}finally{clearTimeout(timer);}}
async function refresh(){
 if(busy)return;busy=true;
 try{
 const [snapshot,global]=await Promise.allSettled([json((window.DHB_DATA||'data/')+'quotes.json?t='+Date.now()),json('https://api.gold-api.com/price/XAU')]);
 if(snapshot.status==='fulfilled'&&snapshot.value.body.schemaVersion===1){const r=snapshot.value;sources=r.body.sources||{};transport={mode:r.mode,offline:navigator.onLine===false,lastOnline:r.online||(r.mode==='network'?new Date().toISOString():transport?.lastOnline)};}
 else transport={...transport,mode:'unavailable',offline:navigator.onLine===false};
 if(global.status==='fulfilled'){const g=global.value.body,q={status:'available',sell:Number(g.price),sourceTime:g.updatedAt};if(g.symbol==='XAU'&&(!g.currency||g.currency==='USD')&&positive(q.sell)&&Q.assess(q).usable)sources.gold=q;}
 render();
 }finally{busy=false;}
}
window.addEventListener('offline',()=>{transport={...transport,mode:'unavailable',offline:true};render();});
window.addEventListener('online',refresh);
setInterval(render,30000);setInterval(refresh,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
render();refresh();
})();
