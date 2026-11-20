(function(){
'use strict';
const $=id=>document.getElementById(id),session=[],history=[];
let mode='session';
const fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
function render(){
 const points=mode==='session'?session:history,host=$('nativeChart');host.replaceChildren();
 ['session','history'].forEach(view=>{
  const button=$(view==='session'?'chartSession':'chartHistory'),active=mode===view;
  button.setAttribute('aria-pressed',String(active));
  button.classList.toggle('ghost',!active);
 });
 $('chartValue').textContent='—';
 if(!points.length){$('liveChartStatus').textContent=mode==='history'?'القراءات اليومية غير متاحة حاليًا.':'في انتظار أول قراءة للجلسة الحالية.';return;}
 $('chartValue').textContent=fmt(points.at(-1).value);
 const values=points.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.15,1),min=lo-pad,max=hi+pad;
 const W=Math.max(200,host.clientWidth||720),H=250,L=8,R=W-76,TOP=24,BOTTOM=208,mid=(L+R)/2;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('role','img');svg.setAttribute('aria-label',points.length===1?'قراءة واحدة لسعر الأونصة: '+fmt(values[0])+' دولار':'حركة سعر الأونصة من '+fmt(values[0])+' إلى '+fmt(values.at(-1))+' دولار');svg.style='width:100%;display:block;direction:ltr';
 function el(tag,attrs,text){const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;svg.append(e);return e;}
 for(let i=0;i<4;i++){const y=TOP+i*(BOTTOM-TOP)/3;el('line',{x1:L,x2:R,y1:y,y2:y,stroke:'#ffffff15'});el('text',{x:R+8,y:y+4,fill:'#cdd8e8','font-size':12},fmt(max-(max-min)*i/3));}
 const path=points.map((p,i)=>(i?'L':'M')+((points.length===1?mid:L+i/(points.length-1)*(R-L))).toFixed(2)+' '+(TOP+(max-p.value)/(max-min)*(BOTTOM-TOP)).toFixed(2)).join(' ');
 if(points.length>1)el('path',{d:path+' L'+R+' '+BOTTOM+' L'+L+' '+BOTTOM+' Z',fill:'#efc66c12'});el('path',{d:path,fill:'none',stroke:'#efc66c','stroke-width':3,'stroke-linejoin':'round'});
 if(points.length===1)el('circle',{cx:mid,cy:(TOP+BOTTOM)/2,r:5,fill:'#efc66c'});
 const label=p=>mode==='history'?p.label:new Date(p.label).toLocaleTimeString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit'});
 if(points.length===1)el('text',{x:mid,y:240,fill:'#cdd8e8','font-size':12,'text-anchor':'middle'},label(points[0]));
 else{el('text',{x:L,y:240,fill:'#cdd8e8','font-size':12},label(points[0]));el('text',{x:R,y:240,fill:'#cdd8e8','font-size':12,'text-anchor':'end'},label(points.at(-1)));}
 host.append(svg);$('liveChartStatus').textContent=mode==='session'?(points.length===1?'وصلت قراءة واحدة؛ النقطة تمثل السعر المرصود، وليست مسار حركة.':'حركة الأونصة خلال جلستك • '+points.length+' قراءة')+' • وقت آخر قراءة: '+new Date(points.at(-1).label).toLocaleString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' القاهرة':'آخر '+points.length+' قراءة يومية';
}
render();
$('chartSession').onclick=()=>{mode='session';render();};$('chartHistory').onclick=()=>{mode='history';render();};
window.addEventListener('gold-board-updated',e=>{const q=e.detail.sources.gold,t=Date.parse(q?.sourceTime);if(q?.status!=='available'||!Number.isFinite(q.sell)||q.sell<=0||!Number.isFinite(t)||Date.now()-t>86400000||t-Date.now()>120000)return;if(session.at(-1)?.label!==q.sourceTime){session.push({label:q.sourceTime,value:q.sell});if(session.length>360)session.shift();}render();});
fetch((window.DHB_DATA||'data/')+'history.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(j=>{const seen=new Set();(j.points||[]).filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.d)&&Number.isFinite(p.usd)&&p.usd>0&&p.d<=new Date().toISOString().slice(0,10)).sort((a,b)=>a.d.localeCompare(b.d)).forEach(p=>{if(!seen.has(p.d)){seen.add(p.d);history.push({label:p.d,value:p.usd});}});history.splice(0,Math.max(0,history.length-90));if(mode==='history')render();}).catch(()=>{if(mode==='history')render();});
})();
