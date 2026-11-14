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
 let catalogData=null,selected='pound',refreshBusy=false;
 const productPage=!!document.getElementById('productOfferCards');
 const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const weight=c=>c.kind==='ounce'?'أونصة ترويسية ≈ 31.1035 جرام':c.weight+' جرام';
 async function load(path){const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);try{const r=await fetch(path+'?t='+Date.now(),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error();return await r.json();}finally{clearTimeout(timer);}}
 function renderProduct(){
  if(!catalogData||!productPage)return;
  const data=catalogData,c=data.catalog.find(c=>c.id===selected)||data.catalog.find(c=>c.id==='pound');selected=c.id;
  $('selectedProductName').textContent=c.name;
  $('selectedProductSpec').textContent=weight(c)+' • عيار '+c.karat+(c.kind==='ounce'?' • سعر منتج فعلي بالجنيه، مستقل عن سعر الأونصة العالمي بالدولار':'');
  document.querySelectorAll('[data-product-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.productKind===c.kind)));
  $('barWeightControl').hidden=c.kind!=='bars';if(c.kind==='bars')$('barWeight').value=c.id;
  $('productPermalink').href=(window.DHB_BASE||'')+'products/'+c.id+'/';
  const selectedRows=productRows(data,c.id).filter(o=>displayable(o)&&(!$('storeFilter').value||o.store===$('storeFilter').value)&&(!$('stockOnly').checked||o.inStock===true));
  $('offersStatus').textContent=selectedRows.length?'أسعار المنتج بالجنيه المصري • راجع شمول الرسوم قبل الشراء':'السعر غير متاح حاليًا لهذا المنتج';
  renderRetailers(data);renderJewelry(data);
  const cards=$('productOfferCards');cards.replaceChildren();
  selectedRows.forEach((o,i)=>{
   const card=element('article','retail-card');
   card.append(element('div','source-type',o.brand==='El Galla'?'ذهب عيار '+c.karat:o.brand||'ذهب عيار '+c.karat),element('h3','',o.store||'محل ذهب'),element('p','retail-price',f(o.listedPrice)));
   card.append(element('span','badge',o.inStock===false?'غير متوفر حاليًا':o.priceKind==='indicative'?'سعر استرشادي • الإجمالي يراجع قبل الشراء':'سعر المنتج'));
   const facts=element('dl','retail-facts');
   const lines=[['الوزن والعيار',weight(c)+' • عيار '+c.karat],['المصنعية والضريبة',Number.isFinite(o.makingAndVAT)?f(o.makingAndVAT)+' ضمن الإجمالي':o.manufacturingIncluded===true&&o.taxIncluded===true?'مشمولة':Number.isFinite(o.declaredMakingCharge)?'مصنعية معلنة '+f(o.declaredMakingCharge)+' • يُراجع شمولها والضريبة في السعر':'يُراجع شمولها قبل الشراء'],['الدمغة والشحن',o.stampIncluded===true?'الدمغة مشمولة • الشحن يُراجع عند الشراء':'يُراجع شمولها قبل الشراء']];
   lines.forEach(([label,value])=>{const item=element('div');item.append(element('dt','',label),element('dd','',value));facts.append(item);});card.append(facts);
   if(Number.isFinite(o.buybackPrice))card.append(element('p','x-note','إعادة الشراء: '+f(o.buybackPrice)+' • وفق الفحص وشروط التغليف'));
   if(Number.isFinite(o.buybackPrice)&&o.buybackPrice>0){const diff=o.listedPrice-o.buybackPrice;card.append(element('div','liquidity-note','فرق التسييل: '+(diff>=0?'نقص ':'زيادة ')+f(Math.abs(diff))+' • الفرق بين السعرين المعلنين قبل أي رسوم إضافية.'));}
   const compare=element('button','x-btn ghost','أضف للمقارنة');compare.type='button';compare.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('dhb-compare-add',{detail:{name:c.name+' • '+o.store+(o.brand&&o.brand!=='El Galla'?' • '+o.brand:''),weight:c.weight,karat:c.karat,total:o.listedPrice,buyback:Number.isFinite(o.buybackPrice)?o.buybackPrice:null,final:false}})));card.append(compare);
   cards.append(card);
  });
  if(!selectedRows.length){const jewelry=(data.offers||[]).some(o=>o.kind==='jewelry'&&o.store===$('storeFilter').value&&displayable(o));cards.append(element('p','notice',jewelry?'عروض المحل المتاحة مشغولات ذهب؛ شوفها تحت في قسم المشغولات.':'لا يوجد سعر لهذا المنتج عند المحل المختار حاليًا. جرّب كل المحلات أو وزنًا آخر، أو ألغِ «المتاح فقط».'));}

 }
 function renderRetailers(data){
  const host=$('retailerCoverage');host.replaceChildren();
  (data.retailers||[]).forEach(r=>{
   const n=(data.offers||[]).filter(o=>o.store===r.name&&displayable(o)).length;
   const card=element('article','retailer-status'+(n?' available':''));card.append(element('h3','',r.name),element('p','',n?n+' منتجات بسعر معلن':'السعر غير متاح حاليًا'),element('span','x-note',r.name==='BTC'&&n?'أسعار استرشادية للوزن؛ راجع التصميم والإجمالي':n?'راجع وزن المنتج وعياره والرسوم':'لا نعرض رقمًا تقديريًا باسم المحل'));
   host.append(card);
  });
 }
 function renderJewelry(data){
  const store=$('storeFilter').value,rows=(data.offers||[]).filter(o=>o.kind==='jewelry'&&displayable(o)&&(!store||o.store===store)&&(!$('stockOnly').checked||o.inStock===true));
  $('jewelryOffers').hidden=!rows.length;const host=$('jewelryOfferCards');host.replaceChildren();
  rows.forEach(o=>{
   const card=element('article','retail-card');card.append(element('div','source-type',o.store),element('h3','',o.productTitle||o.name),element('p','retail-price',f(o.listedPrice)),element('span','badge',o.inStock===true?'متاح حسب العرض':o.inStock===false?'غير متوفر حاليًا':'التوافر يحتاج تأكيد'));
   const dl=element('dl','retail-facts');[['وزن الذهب',o.weight+' جرام • عيار '+o.karat],['الموديل',o.sku],['المصنعية والضريبة والرسوم','راجع شمولها في إجمالي القطعة قبل الدفع']].forEach(([k,v])=>{const row=element('div');row.append(element('dt','',k),element('dd','',v));dl.append(row);});card.append(dl);
   const b=element('button','x-btn ghost','قارن هذه القطعة');b.type='button';b.onclick=()=>window.dispatchEvent(new CustomEvent('dhb-compare-add',{detail:{name:(o.productTitle||o.name)+' • '+o.store,weight:o.weight,karat:o.karat,total:o.listedPrice,buyback:null,final:false}}));card.append(b);host.append(card);
  });
 }
 function offers(data){
  if(data.schemaVersion!==2||!Array.isArray(data.catalog)||!data.catalog.length)throw Error('Missing product catalog');
  catalogData=data;
  if(productPage){const select=$('storeFilter'),previous=select.value;select.replaceChildren();const all=element('option','','كل المحلات');all.value='';select.append(all);[...new Set([...data.offers.filter(o=>displayable(o)).map(o=>o.store),...(data.retailers||[]).map(r=>r.name)])].sort().forEach(name=>{const option=element('option','',name);option.value=name;select.append(option);});select.value=[...select.options].some(o=>o.value===previous)?previous:'';}
  const weights=$('barWeight');weights.replaceChildren();data.catalog.filter(c=>c.kind==='bars').forEach(c=>{const o=element('option','',c.weight+' جرام • عيار '+c.karat);o.value=c.id;weights.append(o);});
  weights.value='bar10';
  const summary=$('productSummary');summary.replaceChildren();
  ['quarter','half','pound','bar10','ounce'].forEach(id=>{
   const c=data.catalog.find(p=>p.id===id);if(!c)return;
   const available=productRows(data,id).filter(o=>displayable(o));
   const representative=available.find(o=>o.inStock===true)||available.find(o=>o.inStock!==false)||available[0];
   const link=element('a','product-summary-card');link.href=(window.DHB_BASE||'')+'products/'+id+'/';
   link.append(element('span','label',c.name),element('strong','summary-price',representative?f(representative.listedPrice):'غير متاح'),element('span','small',weight(c)+' • عيار '+c.karat),element('span','small',representative?(representative.inStock===false?'غير متوفر حاليًا':'راجع الرسوم والتوافر'):'انتظار السعر'));
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
  if(refreshBusy)return;refreshBusy=true;if(productPage){$('refresh').disabled=true;$('fetchStatus').textContent='تحميل أسعار المحلات…';}
  const D=window.DHB_DATA||'data/';
  try{offers(await load(D+'offers.json'));}catch(_){catalogError('تعذر تحميل أسعار المنتجات.');}
  if(document.getElementById('telegramStatus')){
   try{telegram(await load(D+'alert-state.json'));}catch(_){$('telegramStatus').textContent='حالة التنبيهات غير متاحة.';}
  }

  refreshBusy=false;if(productPage){$('refresh').disabled=false;$('fetchStatus').textContent='';}
 }
 if(productPage){$('storeFilter').addEventListener('change',renderProduct);$('stockOnly').addEventListener('change',renderProduct);$('refresh').addEventListener('click',refresh);}
 refresh();setInterval(refresh,60000);
})();
