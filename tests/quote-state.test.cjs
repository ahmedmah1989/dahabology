const {test}=require('node:test'),assert=require('node:assert/strict'),Q=require('../public/js/quote-state.js');
const now=Date.parse('2026-11-20T14:00:00Z'),q=age=>({status:'available',sourceTime:new Date(now-age).toISOString()});
test('original timestamp policy keeps five minute and24hour boundaries',()=>{
for(const [age,usable,fresh] of [[0,true,true],[300000,true,true],[360000,true,false],[43200000,true,false],[86400000,true,false],[86400001,false,false],[-120000,true,true],[-300000,false,false]]){assert.equal(Q.assess(q(age),now).usable,usable);assert.equal(Q.assess(q(age),now).fresh,fresh)}
for(const sourceTime of [undefined,'bad','2026-11-20T14:00:00'])assert.equal(Q.assess({status:'available',sourceTime},now).usable,false);
for(const age of [43200000,360000]){const d=Q.describe(q(age),now);assert.strictEqual(d,"");assert.doesNotMatch(d,/متأخر|حديثة|العمر|دقيقة/)}assert.match(Q.describe(q(86400001),now),/لا يوجد تسعير/);
});
test('transport state never confuses cache with successful online check',()=>{
assert.match(Q.connection({mode:'cache',offline:true,lastOnline:new Date(now).toISOString()}),/غير متصل/);
assert.match(Q.connection({mode:'cache',offline:false}),/تعذر جلب/);
assert.equal(Q.connection({mode:'network'}),'');
assert.match(Q.connection({mode:'unavailable',offline:false}),/تعذر التحقق/);
});
test('last published stale quote is display only: labelled, absent when usable or invalid',()=>{
const old={status:'available',sell:53.87,sourceTime:new Date(now-30*3600000).toISOString()};
const t=Q.lastPublished(old,'بنك مصر','جنيه للدولار',now);
assert.match(t,/53\.87/);assert.match(t,/بنك مصر/);assert.match(t,/أقدم من 24 ساعة/);assert.match(t,/مش داخل في أي حساب/);
assert.equal(Q.assess(old,now).usable,false);
assert.equal(Q.lastPublished({...old,sourceTime:new Date(now-1000).toISOString()},'x','y',now),'');
assert.equal(Q.lastPublished({...old,sell:0},'x','y',now),'');
assert.equal(Q.lastPublished({...old,status:'unavailable'},'x','y',now),'');
assert.equal(Q.lastPublished({...old,sourceTime:'2026-11-19T11:20:47'},'x','y',now),'');
});

{ // official CBE daily reference: display-only, date label, never usable for the 24h gate
  const Q2=require('../public/js/quote-state.js'), now=Date.parse('2026-11-21T15:40:00Z');
  const cbe={status:'available',buy:53.7629,sell:53.8629,quoteDate:'2026-11-19'};
  const o=Q2.official(cbe,now);
  assert.equal(o.value,'53.86');assert.equal(o.label,'متوسط الدولار بالمركزي');assert.match(o.text,/سعر البيع/);assert.match(o.text,/الخميس/);assert.match(o.text,/19/);
  assert.equal(Q2.assess(cbe,now).usable,false);
  assert.equal(Q2.official({...cbe,status:'unavailable'},now),null);
  assert.equal(Q2.official({...cbe,quoteDate:'2026-12-30'},now),null);
  assert.equal(Q2.official({...cbe,quoteDate:'2026-11-22'},now),null); // tomorrow in Cairo
  assert.ok(Q2.official({...cbe,quoteDate:'2026-11-21'},now)); // today
  assert.equal(Q2.official({...cbe,quoteDate:'1970-01-01'},now),null);
  assert.equal(Q2.official({...cbe,quoteDate:'2025-11-19'},now),null);
  assert.equal(Q2.official({...cbe,quoteDate:'2026-11-09'},now),null); // 12 days old
  assert.ok(Q2.official({...cbe,quoteDate:'2026-11-12'},now)); // 9 days, long holiday
  assert.match(o.text,/2026/);
  assert.equal(Q2.official({...cbe,quoteDate:'2026-02-31'},now),null);
  assert.equal(Q2.official({...cbe,quoteDate:'bad'},now),null);
  assert.equal(Q2.official({...cbe,sell:0},now),null);
}
