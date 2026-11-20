const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(points=[]){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',attributes:{},classes:new Set(id==='chartHistory'?['ghost']:[]),replaceChildren(){},setAttribute(k,v){this.attributes[k]=v;},classList:{toggle(k,on){const s=elements.get(id).classes;on?s.add(k):s.delete(k);}}});return elements.get(id);};
 const context={document:{getElementById:get},window:{addEventListener(){}},fetch:async()=>({ok:true,json:async()=>({points})}),Date,Number,Set};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/live-view.js'),'utf8'),context);
 return get;
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
