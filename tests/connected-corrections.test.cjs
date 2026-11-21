const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const Q=require('../public/js/quote-state.js'),L=require('../public/js/ledger-model.js'),M=require('../public/js/monitor.js');
const now=Date.parse('2026-11-21T15:00:00Z'),fresh={status:'available',sourceTime:new Date(now).toISOString()};
const cbe={status:'available',sell:53.8629,quoteDate:'2026-11-19'};
const s={cbe,misr:{...fresh,sell:999},gold:{...fresh,sell:4000},isagha:{...fresh,'24':{sell:6400},'21':{sell:5600}}};
test('one CBE reference, no Misr fallback, date-only never promoted to a live quote',()=>{
 const fx=Q.reference(s,now);assert.equal(fx.sell,53.8629);assert.equal(fx.quoteDate,'2026-11-19');assert.equal(fx.sourceTime,undefined);
 assert.equal(Q.assess(cbe,now).usable,false);assert.equal(M.assess(s,now).fresh,false);
 assert.equal(Q.reference({...s,cbe:null},now),null);assert.equal(M.assess({...s,cbe:null},now).usable,false);
 assert.equal(Q.reference({...s,cbe:{...cbe,sell:Infinity}},now),null);
 assert.equal(Q.reference({...s,cbe:{...cbe,quoteDate:'2026-11-22'}},now),null);
 assert.equal(Q.reference({...s,cbe:{...cbe,quoteDate:'2026-11-10'}},now),null);
 const a=M.calculate(s.gold.sell,fx.sell,6400,5600);assert.ok(Math.abs(a.globalEGP-4000/31.1034768*53.8629)<1e-8);
 assert.equal(Q.implied(s,now),Q.implied({...s,cbe:null,misr:null},now));
 for(const key of ['isagha','gold'])assert.equal(Q.implied({...s,[key]:{...s[key],sourceTime:'2026-11-19T00:00:00Z'}},now),null);
});
test('every acquisition type stores both explicit purposes, legacy unknown remains absent, valuation unchanged',()=>{
 const inv={id:'i',date:'2025-01-01',mode:'none'};
 for(const type of ['bar','coin','jewelry','scrap'])for(const purpose of ['adornment','saving']){
 const line={id:'g',type,karat:24,qty:'2',whole:'5',frac:'125',paid:'1000',stones:'without',purpose};
 const out=L.buildInvoice(inv,[line]);assert.ok(!out.error);assert.equal(out.rows[0].purpose,purpose);assert.equal(out.rows[0].grams,10.25);assert.equal(out.rows[0].qty,2);
 const noPurpose={...out.rows[0]};delete noPurpose.purpose;
 assert.deepEqual(L.valuation(out.rows[0],{24:{buy:6000,sell:6100}}),L.valuation(noPurpose,{24:{buy:6000,sell:6100}}));
 }
 for(const type of ['bar','coin','scrap']){const out=L.buildInvoice(inv,[{id:'old',type,karat:24,qty:'1',whole:'5',paid:'1000',stones:'without'}]);assert.ok(!out.error);assert.equal('purpose' in out.rows[0],false);}
});
test('current UI FX consumers contain no hidden Misr selector; dormant religious engine untouched',()=>{
 for(const p of ['home-quotes','market-view','monitor','analytics','tools'])assert.doesNotMatch(fs.readFileSync('public/js/'+p+'.js','utf8'),/(?:sources|s)\.misr/);
 assert.doesNotMatch(fs.readFileSync('src/panels/market.html','utf8'),/بنك مصر/);
 assert.match(fs.readFileSync('public/js/number-fit.js','utf8'),/characterData:true/);
});
