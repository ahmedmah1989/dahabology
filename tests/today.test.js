const test=require('node:test');const assert=require('node:assert/strict');
const {todayPoint,withToday,cairoDay,metrics}=require('../public/js/analytics.js');
test('analysis reaches today in Cairo with a fresh genuine quote, including after midnight',()=>{
 const now=Date.parse('2026-11-13T22:01:00Z');
 const sources={gold:{status:'available',sell:3890,sourceTime:'2026-11-13T22:00:30Z'},misr:{status:'available',sell:50,sourceTime:'2026-11-13T15:00:00Z'}};
 assert.equal(cairoDay(now),'2026-11-14');const point=todayPoint(sources,now);
 assert.equal(point.d,'2026-11-14');assert.equal(point.egp,194500);assert.equal(point.provisional,true);
 const historical=[{d:'2026-11-12',usd:3900,egp:195000},{d:'2026-11-13',usd:3880,egp:194000}];
 const display=withToday([...historical,point],sources,now);assert.equal(display.length,3);assert.equal(display.at(-1).usd,3890);
 assert.equal(todayPoint({...sources,gold:{...sources.gold,sourceTime:'2026-11-13T21:59:30Z'}},now),null);
 assert.equal(todayPoint({...sources,gold:{...sources.gold,sourceTime:'2026-11-13T22:10:00Z'}},now),null);
 assert.equal(todayPoint(sources,now+6*60000),null);
 assert.equal(todayPoint({...sources,misr:null},now).egp,null);
 assert.equal(withToday(historical,null,now).at(-1).d,'2026-11-13');
});
test('unfinished today affects current trend without entering historical daily volatility',()=>{
 const history=[];for(let i=0;history.length<61;i++){const d=new Date(Date.UTC(2026,5,1)+i*86400000);if(d.getUTCDay()%6)history.push({d:d.toISOString().slice(0,10),usd:3000+history.length*3,egp:(3000+history.length*3)*50});}
 const old=metrics(history);assert.ok(old.sdD>0);
 const provisional={d:new Date(Date.parse(history.at(-1).d)+86400000).toISOString().slice(0,10),usd:4000,egp:200000,provisional:true};
 const current=metrics([...history,provisional]);assert.equal(current.sdD,old.sdD);assert.equal(current.last.usd,4000);assert.notEqual(current.sma50,old.sma50);
});
