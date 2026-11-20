const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(points=[]){
 const elements=new Map(),listeners={};
 const make=()=>({attributes:{},children:[],style:'',setAttribute(k,v){this.attributes[k]=v;},append(e){this.children.push(e);}});
 const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',attributes:{},classes:new Set(id==='chartHistory'?['ghost']:[]),children:[],clientWidth:300,append(e){this.children.push(e);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attributes[k]=v;},classList:{toggle(k,on){const s=elements.get(id).classes;on?s.add(k):s.delete(k);}}});return elements.get(id);};
 const context={document:{getElementById:get,createElementNS:make},window:{addEventListener(k,f){listeners[k]=f;}},fetch:async()=>({ok:true,json:async()=>({points})}),Date,Number,Set};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/live-view.js'),'utf8'),context);
 get.update=detail=>listeners['gold-board-updated']({detail});return get;
}
test('chart selected state controls both visual and accessible state',()=>{
 const get=setup();
 const check=active=>{for(const id of ['chartSession','chartHistory']){assert.equal(get(id).attributes['aria-pressed'],String(id===active));assert.equal(get(id).classes.has('ghost'),id!==active);}};
 check('chartSession');get('chartHistory').onclick();check('chartHistory');get('chartSession').onclick();check('chartSession');
});
test('switching to an empty series clears the previous price',()=>{
 const get=setup();get('chartValue').textContent='5000';get('chartHistory').onclick();assert.equal(get('chartValue').textContent,'—');assert.match(get('liveChartStatus').textContent,/اليومية/);
 get('chartValue').textContent='4000';get('chartSession').onclick();assert.equal(get('chartValue').textContent,'—');assert.match(get('liveChartStatus').textContent,/جلسة/);
});

test('one quote is a readable point, duplicate timestamps do not invent a path',()=>{
 const get=setup(),time=new Date().toISOString(),sources={gold:{status:'available',sell:3500,sourceTime:time}};
 get.update({sources});get.update({sources});
 assert.equal(get('chartValue').textContent,'3,500');
 assert.match(get('liveChartStatus').textContent,/قراءة واحدة/);
 assert.match(get('liveChartStatus').textContent,/القاهرة/);
 const svg=get('nativeChart').children[0];
 assert.equal(svg.attributes.viewBox,'0 0 300 250');
 assert.equal(svg.children.filter(e=>e.attributes.r===5).length,1);
 assert.ok(svg.children.filter(e=>e.attributes['font-size']).every(e=>e.attributes['font-size']>=12));
 assert.ok(svg.children.every(e=>!String(e.attributes.d||'').includes('NaN')));
});
test('a second observation produces a real two-point session path',()=>{
 const get=setup(),time=Date.now();
 for(let i=0;i<2;i++)get.update({sources:{gold:{status:'available',sell:3500+i,sourceTime:new Date(time+i*1000).toISOString()}}});
 assert.match(get('liveChartStatus').textContent,/2 قراءة/);
 assert.equal(get('chartValue').textContent,'3,501');
 assert.equal(get('nativeChart').children[0].children.filter(e=>e.attributes.r===5).length,0);
});
