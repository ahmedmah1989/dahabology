(function(){
 'use strict';
 const $=id=>(document.getElementById(id)||document.createElement('div'));
 const f=v=>Number.isFinite(v)?v.toLocaleString('ar-EG-u-nu-latn',{maximumFractionDigits:2})+' جنيه':'غير متاح';
 const t=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo'}):'غير منشور';
 function validOffer(o,now=Date.now()){
  const stamp=Date.parse(o.sourceTime);
  return o.status==='observed'&&o.identityVerified===true&&o.inStock===true&&[o.manufacturingIncluded,o.taxIncluded,o.stampIncluded].every(x=>x===true)&&Number.isFinite(o.listedPrice)&&o.listedPrice>0&&typeof o.sourceTime==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(o.sourceTime)&&Number.isFinite(stamp)&&now-stamp<=300000&&stamp-now<=120000;
 }
 function displayable(o,now=Date.now()){
  const checked=Date.parse(o.checkedAt);
  return o.status==='observed'&&o.identityVerified===true&&Number.isFinite(o.listedPrice)&&o.listedPrice>0&&Number.isFinite(checked)&&now-checked<=86400000&&checked-now<=120000;
 }
 function productRows(data,id){return (data.offers||[]).filter(o=>o.productId===id);}
 if(typeof module!=='undefined')module.exports={validOffer,displayable,productRows};
 if(typeof document==='undefined')return;
 let catalogData=null,selected='pound';
 const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const weight=c=>c.kind==='ounce'?'أونصة ترويسية ≈ 31.1035 جرام':c.weight+' جرام';
 async function load(path){const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);try{const r=await fetch(path+'?t='+Date.now(),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error();return await r.json();}finally{clearTimeout(timer);}}
 function renderProduct(){
  if(!catalogData)return;
  const data=catalogData,c=data.catalog.find(c=>c.id===selected)||data.catalog.find(c=>c.id==='pound');selected=c.id;
  $('selectedProductName').textContent=c.name;
  $('selectedProductSpec').textContent=weight(c)+' • عيار '+c.karat+(c.kind==='ounce'?' • سعر منتج فعلي بالجنيه، مستقل عن سعر الأونصة العالمي بالدولار':'');
  document.querySelectorAll('[data-product-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.productKind===c.kind)));
  $('barWeightControl').hidden=c.kind!=='bars';if(c.kind==='bars')$('barWeight').value=c.id;
  $('productPermalink').href=(window.DHB_BASE||'')+'products/'+c.id+'/';
  const selectedRows=productRows(data,c.id).filter(o=>displayable(o));
  $('offersStatus').textContent=selectedRows.length?'أسعار المنتج بالجنيه المصري • راجع شمول الرسوم قبل الشراء':'السعر غير متاح حاليًا لهذا المنتج';
  const cards=$('productOfferCards');cards.replaceChildren();
  selectedRows.forEach((o,i)=>{
   const card=element('article','retail-card');
   card.append(element('div','source-type',o.brand==='El Galla'?'ذهب عيار '+c.karat:o.brand||'ذهب عيار '+c.karat),element('h3','',c.name),element('p','retail-price',f(o.listedPrice)));
   card.append(element('span','badge',o.inStock===false?'غير متوفر حاليًا':'سعر المنتج'));
   const facts=element('dl','retail-facts');
   const lines=[['الوزن والعيار',weight(c)+' • عيار '+c.karat],['المصنعية والضريبة',Number.isFinite(o.makingAndVAT)?f(o.makingAndVAT)+' ضمن الإجمالي':o.manufacturingIncluded===true&&o.taxIncluded===true?'مشمولة':Number.isFinite(o.declaredMakingCharge)?'مصنعية معلنة '+f(o.declaredMakingCharge)+' • يُراجع شمولها والضريبة في السعر':'يُراجع شمولها قبل الشراء'],['الدمغة والشحن',o.stampIncluded===true?'الدمغة مشمولة • الشحن يُراجع عند الشراء':'يُراجع شمولها قبل الشراء']];
   lines.forEach(([label,value])=>{const item=element('div');item.append(element('dt','',label),element('dd','',value));facts.append(item);});card.append(facts);
   if(Number.isFinite(o.buybackPrice))card.append(element('p','x-note','إعادة الشراء: '+f(o.buybackPrice)+' • وفق الفحص وشروط التغليف'));
   cards.append(card);
  });
  if(!selectedRows.length)cards.append(element('p','notice','اختر وزنًا آخر أو جرّب لاحقًا. لا نعرض سعرًا غير متحقق منه.'));

 }
 function offers(data){
  if(data.schemaVersion!==2||!Array.isArray(data.catalog)||!data.catalog.length)throw Error('Missing product catalog');
  catalogData=data;
  const weights=$('barWeight');weights.replaceChildren();data.catalog.filter(c=>c.kind==='bars').forEach(c=>{const o=element('option','',c.weight+' جرام • عيار '+c.karat);o.value=c.id;weights.append(o);});
  weights.value='bar10';
  const summary=$('productSummary');summary.replaceChildren();
  ['quarter','half','pound','bar10','ounce'].forEach(id=>{
   const c=data.catalog.find(p=>p.id===id);if(!c)return;
   const representative=productRows(data,id).find(o=>displayable(o));
   const link=element('a','product-summary-card');link.href=(window.DHB_BASE||'')+'products/'+id+'/';
   link.append(element('span','label',c.name),element('strong','summary-price',representative?f(representative.listedPrice):'غير متاح'),element('span','small',weight(c)+' • عيار '+c.karat),element('span','small',representative?'سعر المنتج':'انتظار السعر'));
   link.append(element('span','summary-action','تفاصيل المنتج ←'));
   summary.append(link);
  });
  route();
 }
 function choose(id){if(catalogData?.catalog.some(c=>c.id===id)){if(id!==selected)location.href=(window.DHB_BASE||'')+'products/'+id+'/';}}
 function route(){const [panel,id]=location.hash.slice(1).split('/');const want=panel==='products'&&id?id:window.DHB_PRODUCT;if(catalogData?.catalog.some(c=>c.id===want))selected=want;renderProduct();}
 document.querySelectorAll('[data-product-kind]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.productKind==='bars'?$('barWeight').value||'bar10':b.dataset.productKind)));
 $('barWeight').addEventListener('change',()=>choose($('barWeight').value));
 window.addEventListener('hashchange',route);
 function telegram(data){
  const status=data.service?.status,checked=Date.parse(data.service?.checkedAt),recent=Number.isFinite(checked)&&Date.now()-checked<=30*60000;
  const names={awaiting_configuration:'المفاتيح غير موصولة',connection_needs_review:'الربط يحتاج مراجعة',waiting_for_fresh_synchronized_quotes:'انتظار أسعار محلية حديثة ومصادر صالحة للمقارنة',local_monitoring_gap_waiting:'مراقبة القمم والهبوط المحلي جاهزة؛ تنبيهات الفجوة تنتظر مصادر حديثة ومتزامنة',baseline_created:'الربط جاهز وتم إنشاء مرجع صامت للمقارنة',no_material_change:'لم يتحقق تغير مهم يستدعي رسالة',sent:'أُرسل تنبيه لتغير مهم',delivery_needs_review:'نتيجة إرسال سابق تحتاج مراجعة قبل إعادة المحاولة'};
  $('telegramStatus').textContent=(recent?'':'حالة محفوظة؛ لم يصل فحص خلال آخر 30 دقيقة. ')+(names[status]||'الحالة لم تصل بعد')+' • آخر فحص '+t(data.service?.checkedAt);
  $('telegramConnection').textContent=data.connection?.status==='confirmed'?'Telegram أكد إرسال رسالة تأكيد الربط؛ لا يثبت ذلك فتحها أو قراءتها.':'لا يوجد تأكيد موثق لرسالة الربط حتى الآن.';
 }
 function catalogError(message){
  if(catalogData){offers(catalogData);$('offersStatus').textContent=message+' جرّب مرة أخرى لاحقًا.';}
  else{$('offersStatus').textContent=message;$('productSummary').replaceChildren(element('p','notice',message));}
 }
 async function refresh(){
  const D=window.DHB_DATA||'data/';
  try{offers(await load(D+'offers.json'));}catch(_){catalogError('تعذر تحميل أسعار المنتجات.');}
  if(document.getElementById('telegramStatus')){
   try{telegram(await load(D+'alert-state.json'));}catch(_){$('telegramStatus').textContent='حالة التنبيهات غير متاحة.';}
  }

 }
 refresh();setInterval(refresh,60000);
})();
