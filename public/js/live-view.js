(function(){
'use strict';
const $=id=>document.getElementById(id),session=[],history=[];
let mode='session';
const fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
function render(){
 const points=mode==='session'?session:history,host=$('nativeChart');host.replaceChildren();
 $('chartSession').setAttribute('aria-pressed',String(mode==='session'));
 $('chartHistory').setAttribute('aria-pressed',String(mode==='history'));
 if(!points.length){$('liveChartStatus').textContent='القراءات غير متاحة حاليًا.';return;}
 $('chartValue').textContent=fmt(points.at(-1).value);
 if(points.length<2){$('liveChartStatus').textContent='وصلت أول قراءة. يظهر المسار عند وصول القراءة التالية.';return;}
 const values=points.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.15,1),min=lo-pad,max=hi+pad;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 720 300');svg.setAttribute('role','img');svg.setAttribute('aria-label','حركة سعر الأونصة من '+fmt(values[0])+' إلى '+fmt(values.at(-1))+' دولار');svg.style='width:100%;display:block;direction:ltr';
 function el(tag,attrs,text){const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;svg.append(e);return e;}
 for(let i=0;i<4;i++){const y=24+i*72;el('line',{x1:12,x2:630,y1:y,y2:y,stroke:'#ffffff15'});el('text',{x:642,y:y+5,fill:'#cdd8e8','font-size':14},fmt(max-(max-min)*i/3));}
 const path=points.map((p,i)=>(i?'L':'M')+(12+i/(points.length-1)*618).toFixed(2)+' '+(24+(max-p.value)/(max-min)*216).toFixed(2)).join(' ');
 el('path',{d:path+' L630 240 L12 240 Z',fill:'#efc66c12'});el('path',{d:path,fill:'none',stroke:'#efc66c','stroke-width':3,'stroke-linejoin':'round'});
 const label=p=>mode==='history'?p.label:new Date(p.label).toLocaleTimeString('ar-EG-u-nu-latn',{hour:'2-digit',minute:'2-digit'});
 el('text',{x:12,y:280,fill:'#cdd8e8','font-size':14},label(points[0]));el('text',{x:630,y:280,fill:'#cdd8e8','font-size':14,'text-anchor':'end'},label(points.at(-1)));
 host.append(svg);$('liveChartStatus').textContent=mode==='session'?'حركة الأونصة خلال جلستك • '+points.length+' قراءة':'آخر '+points.length+' قراءة يومية';
}
$('chartSession').onclick=()=>{mode='session';render();};$('chartHistory').onclick=()=>{mode='history';render();};
window.addEventListener('gold-board-updated',e=>{const q=e.detail.sources.gold,t=Date.parse(q?.sourceTime);if(q?.status!=='available'||!Number.isFinite(q.sell)||q.sell<=0||!Number.isFinite(t)||Date.now()-t>86400000||t-Date.now()>120000)return;if(session.at(-1)?.label!==q.sourceTime){session.push({label:q.sourceTime,value:q.sell});if(session.length>360)session.shift();}render();});
fetch((window.DHB_DATA||'data/')+'history.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(j=>{const seen=new Set();(j.points||[]).filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.d)&&Number.isFinite(p.usd)&&p.usd>0&&p.d<=new Date().toISOString().slice(0,10)).sort((a,b)=>a.d.localeCompare(b.d)).forEach(p=>{if(!seen.has(p.d)){seen.add(p.d);history.push({label:p.d,value:p.usd});}});history.splice(0,Math.max(0,history.length-90));if(mode==='history')render();}).catch(()=>{if(mode==='history')render();});
})();
