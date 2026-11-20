const {test}=require('node:test'),assert=require('node:assert/strict'),Q=require('../public/js/quote-state.js');
const now=Date.parse('2026-11-20T14:00:00Z'),q=age=>({status:'available',sourceTime:new Date(now-age).toISOString()});
test('original timestamp policy keeps five minute and24hour boundaries',()=>{
for(const [age,usable,fresh] of [[0,true,true],[300000,true,true],[360000,true,false],[43200000,true,false],[86400000,true,false],[86400001,false,false],[-120000,true,true],[-300000,false,false]]){assert.equal(Q.assess(q(age),now).usable,usable);assert.equal(Q.assess(q(age),now).fresh,fresh)}
for(const sourceTime of [undefined,'bad','2026-11-20T14:00:00'])assert.equal(Q.assess({status:'available',sourceTime},now).usable,false);
assert.match(Q.describe(q(43200000),now),/متأخرة/);assert.match(Q.describe(q(360000),now),/6 دقيقة/);assert.match(Q.describe(q(86400001),now),/لا يوجد تسعير/);
});
test('transport state never confuses cache with successful online check',()=>{
assert.match(Q.connection({mode:'cache',offline:true,lastOnline:new Date(now).toISOString()}),/غير متصل/);
assert.match(Q.connection({mode:'cache',offline:false}),/تعذر جلب/);
assert.match(Q.connection({mode:'network'}),/أونلاين/);
assert.match(Q.connection({mode:'unavailable',offline:false}),/تعذر التحقق/);
});
