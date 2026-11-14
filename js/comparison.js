(function () {
  'use strict';
  function metrics(o) {
    if (!o || ![18,21,24].includes(o.karat) || ![o.weight,o.total].every(v=>Number.isFinite(v)&&v>0)) return null;
    const pure=o.weight*(o.karat/24);
    if(![pure,o.total/o.weight,o.total/pure].every(v=>Number.isFinite(v)&&v>0))return null;
    const buyback=Number.isFinite(o.buyback)&&o.buyback>=0?o.buyback:null;
    return {pure,perGram:o.total/o.weight,perPureGram:o.total/pure,
      loss:o.final===true&&buyback!==null?o.total-buyback:null,
      lossPercent:o.final===true&&buyback!==null?(o.total-buyback)/o.total*100:null};
  }
  function lowest(rows) {
    if(rows.length<2||rows.some(o=>o.final!==true||!metrics(o)))return [];
    const min=Math.min(...rows.map(o=>metrics(o).perPureGram));
    return rows.map((o,i)=>Math.abs(metrics(o).perPureGram-min)<0.005?i:-1).filter(i=>i>=0);
  }
  if(typeof module!=='undefined')module.exports={metrics,lowest};
  if(typeof document==='undefined'||!document.getElementById('compareForm'))return;
  const $=id=>document.getElementById(id),KEY='dhb-compare-v1';
  const num=v=>{const s=String(v).trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,\s]/g,'').replace(/٫/g,'.');return /^\d+(\.\d+)?$/.test(s)?Number(s):NaN;};
  const money=v=>Number.isFinite(v)?v.toLocaleString('ar-EG-u-nu-latn',{maximumFractionDigits:2})+' جنيه':'—';
  const fmt=v=>v.toLocaleString('ar-EG-u-nu-latn',{maximumFractionDigits:3});
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let rows=[];
  try{const saved=JSON.parse(sessionStorage.getItem(KEY));if(Array.isArray(saved))rows=saved.filter(o=>metrics(o)&&typeof o.name==='string').slice(0,3);}catch(_){}
  function save(){try{sessionStorage.setItem(KEY,JSON.stringify(rows));}catch(_){$('compareMessage').textContent='المقارنة تعمل هنا، لكن المتصفح منع الاحتفاظ بها عند الانتقال لصفحة أخرى.';}}
  function render(){
    const host=$('compareCards');host.replaceChildren();const winners=lowest(rows);
    $('compareCount').textContent=rows.length+' من 3 منتجات';
    $('compareEmpty').hidden=rows.length>0;
    $('compareSummary').textContent=rows.length<2?'أضف منتجين لتظهر المقارنة.':winners.length?'التكلفة موحّدة على جرام ذهب صافٍ عيار 24، حتى لو اختلف الوزن أو العيار.':'أكّد شمول إجمالي كل منتج للرسوم قبل ترتيب تكلفة الجرام الصافي.';
    rows.forEach((o,i)=>{
      const m=metrics(o),card=el('article','compare-card'+(winners.includes(i)?' compare-best':''));
      card.append(el('span','badge',o.final?'إجمالي مؤكد منك':'سعر مبدئي • راجع الرسوم'),el('h3','',o.name),el('p','compare-total',money(o.total)));
      const dl=el('dl','retail-facts');
      const facts=[['الوزن والعيار',fmt(o.weight)+' جرام • عيار '+o.karat],['ذهب صافٍ يعادل عيار 24',fmt(m.pure)+' جرام'],['تكلفة جرام المنتج',money(m.perGram)],['تكلفة الجرام الصافي',money(m.perPureGram)],['إعادة البيع المدخلة',Number.isFinite(o.buyback)?money(o.buyback):'لم تُدخل'],['فرق إعادة البيع',m.loss===null?'يلزم إجمالي مؤكد وسعر إعادة بيع':(m.loss<0?'زيادة ': 'نقص ')+money(Math.abs(m.loss))+' ('+fmt(Math.abs(m.lossPercent))+'%)']];
      facts.forEach(([label,value])=>{const d=el('div');d.append(el('dt','',label),el('dd','',value));dl.append(d);});card.append(dl);
      if(winners.includes(i))card.append(el('p','compare-highlight','أقل تكلفة للجرام الصافي ضمن مقارنتك'));
      if(!o.final){const confirm=el('button','x-btn ghost','أكدت الإجمالي شامل الرسوم');confirm.type='button';confirm.onclick=()=>{o.final=true;save();render();};card.append(confirm);}
      const remove=el('button','compare-remove','إزالة');remove.type='button';remove.setAttribute('aria-label','إزالة '+o.name+' من المقارنة');remove.onclick=()=>{rows.splice(i,1);save();render();};card.append(remove);host.append(card);
    });
  }
  $('compareForm').addEventListener('submit',e=>{
    e.preventDefault();
    const o={name:$('compareName').value.trim().slice(0,60)||'منتج '+(rows.length+1),weight:num($('compareWeight').value),karat:Number($('compareKarat').value),total:num($('compareTotal').value),buyback:$('compareBuyback').value.trim()?num($('compareBuyback').value):null,final:$('compareFinal').checked};
    if(!metrics(o)||(o.buyback!==null&&(!Number.isFinite(o.buyback)||o.buyback<0))){$('compareMessage').textContent='اكتب وزنًا وسعرًا أكبر من صفر، وسعر إعادة بيع صحيحًا إن أدخلته.';return;}
    if(rows.length>=3){$('compareMessage').textContent='المقارنة تتسع لثلاثة منتجات. أزل منتجًا لإضافة غيره.';return;}
    rows.push(o);$('compareMessage').textContent='اتضاف المنتج للمقارنة.';save();render();$('compareForm').reset();
  });
  window.addEventListener('dhb-compare-add',e=>{
    const o=e.detail;if(!metrics(o))return;
    $('compareName').value=o.name;$('compareWeight').value=o.weight;$('compareKarat').value=String(o.karat);$('compareTotal').value=o.total;$('compareBuyback').value=Number.isFinite(o.buyback)?o.buyback:'';$('compareFinal').checked=false;
    $('compareMessage').textContent='راجع الإجمالي وأضف سعر إعادة البيع إن كان معك، ثم اضغط إضافة للمقارنة.';
    $('comparisonTool').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});$('compareName').focus({preventScroll:true});
  });
  render();
})();
