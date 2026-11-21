const assert = require('node:assert/strict');
const {calculate, OUNCE} = require('../public/js/monitor.js');
const equal = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
const r=calculate(OUNCE*100,50,5100,4400);
equal(r.globalEGP,5000); equal(r.global21,4375); equal(r.gapEGP,100);
equal(r.gapUSD,2); equal(r.gapPercent,2); equal(r.implied,51);
equal(r.fxGap,1); equal(r.fxPercent,2);
assert.ok(calculate(OUNCE*100,50,4900,4200).gapPercent<0);
assert.equal(calculate(0,50,5100,4400),null);
assert.equal(calculate(3000,NaN,5100,4400),null);
assert.equal('drop24' in calculate(3000,50,8000,7000),false);
assert.equal('drop21' in calculate(3000,50,5100,0),false);
console.log('Gold conversion, premium, implied FX and drawdown checks passed.');
const {assess} = require('../public/js/monitor.js');
const now=Date.parse('2026-11-21T12:00:00Z');
const quote=t=>({status:'available',sourceTime:new Date(t).toISOString()});
const sources={isagha:{...quote(now-60000),'24':{sell:7000},'21':{sell:6125}},cbe:{status:'available',sell:53,quoteDate:'2026-11-19'},misr:{...quote(now),sell:999},gold:{...quote(now),sell:4100}};
assert.equal(assess(sources,now).usable,true);
assert.equal(assess(sources,now).fresh,false);
assert.match(assess(sources,now).reason,/2026-11-19/);
assert.equal(assess({...sources,cbe:null},now).usable,false);
for(const quoteDate of ['2026-11-22','2026-11-10','bad'])assert.equal(assess({...sources,cbe:{...sources.cbe,quoteDate}},now).usable,false);
for(const sourceTime of [new Date(now-86400001).toISOString(),new Date(now+300000).toISOString(),'2026-11-21T12:00:00',''])assert.equal(assess({...sources,gold:{...sources.gold,sourceTime}},now).usable,false);
assert.equal(assess({...sources,cbe:{...sources.cbe,sell:0}},now).usable,false);
assert.equal(assess({...sources,isagha:{...sources.isagha,'24':{sell:0}}},now).usable,false);

{
  const {impliedFromGold} = require('../public/js/monitor.js');
  const now = Date.now(), iso = t => new Date(t).toISOString();
  const S = {isagha:{status:'available',sourceTime:iso(now-1000),'24':{sell:6251.5}}, gold:{status:'available',sourceTime:iso(now-1000),sell:3538.58}, misr:{status:'available',sourceTime:iso(now-30*3600e3),sell:53.87}};
  equal(impliedFromGold(S, now), 6251.5/(3538.58/OUNCE));
  assert.equal(require('../public/js/monitor.js').assess(S, now).usable, false);
  S.gold.sourceTime = iso(now-30*3600e3); assert.equal(impliedFromGold(S, now), null);
  S.gold.sourceTime = iso(now-1000); S.isagha['24'].sell = 0; assert.equal(impliedFromGold(S, now), null);
}
{
  const {impliedStatus} = require('../public/js/monitor.js');
  const now = Date.now(), iso = t => new Date(t).toISOString();
  const mk = () => ({isagha:{status:'available',sourceTime:iso(now-4*3600e3),'24':{sell:6251.5}}, gold:{status:'available',sourceTime:iso(now-1000),sell:3538.58}, misr:{status:'unavailable'}});
  let r = impliedStatus(mk(), now);
  equal(r.value, 6251.5/(3538.58/OUNCE)); assert.ok(r.parts.every(x => x.ok && x.time)); assert.equal(r.maxAgeHours, 24);
  let S = mk(); S.isagha.sourceTime = iso(now-30*3600e3); r = impliedStatus(S, now);
  assert.equal(r.value, null); assert.equal(r.parts[0].why, 'أقدم من 24 ساعة'); assert.equal(r.parts[1].ok, true);
  S = mk(); delete S.gold; r = impliedStatus(S, now); assert.equal(r.value, null); assert.equal(r.parts[1].why, 'غير متاح الآن');
  S = mk(); S.gold.sourceTime = '2026-11-21T10:00:00'; assert.equal(impliedStatus(S, now).parts[1].why, 'بدون وقت مصدر صالح');
  S = mk(); S.gold.sourceTime = iso(now+3600e3); assert.equal(impliedStatus(S, now).parts[1].why, 'وقت المصدر في المستقبل');
  S = mk(); S.isagha['24'].sell = 0; assert.equal(impliedStatus(S, now).value, null);
}
