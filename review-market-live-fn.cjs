/* Market functional closure: karat ring + persistence, gauge, change-vs-close,
   live session/history chart, and the comparison tool (pure-gram normalization,
   validation, Arabic-Indic digits, confirm flow, removal, session persistence,
   dhb-compare-add cross-screen prefill). Synthetic fresh quotes; no network. */
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++};
const root=path.join(__dirname,'dist');
const serve=async dir=>{const s=http.createServer((req,res)=>{let f=path.join(dir,decodeURIComponent(req.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f))});return new Promise(r=>s.listen(0,()=>r(s)))};
const nowIso=()=>new Date().toISOString();
const isaghaDetail=over=>({sources:{isagha:{status:'available',sourceTime:nowIso(),'24':{sell:6400,buy:6350},'21':{sell:5600,buy:5550}},gold:{status:'available',sell:4150.25,sourceTime:nowIso()}},result:{gapPercent:1.5},...over});
const fire=(p,d)=>p.evaluate(d=>dispatchEvent(new CustomEvent('gold-board-updated',{detail:d})),d);
(async()=>{
const server=await serve(root);
const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
/* ---------- market screen ---------- */
{
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));
 await c.route('https://**/*',r=>r.abort());
 const yest=new Date(Date.now()-86400000).toISOString().slice(0,10);
 await c.route('**/local-history.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({days:[{d:yest,'21':{close:5500},'24':{close:6300}}]})}));
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/market/',{waitUntil:'load'});
 await p.waitForTimeout(400);
 ok((await p.locator('#heroPrice').textContent())==='—','no price before a usable quote (never a guess)');
 ok(await p.locator('.x-karats').first().locator('.x-karat').count()===3,'three karat chips');
 ok(await p.locator('.x-karat[data-karat="21"]').getAttribute('aria-pressed')==='true','21k selected by default');
 ok(await p.locator('#gaugeArcs path').count()===4,'gauge has four bands');
 ok(await p.locator('#gaugeLabels text').count()===5,'gauge has five labels');
 await fire(p,isaghaDetail());await p.waitForTimeout(150);
 ok((await p.locator('#heroPrice').textContent())==='5,600','hero price 21k sell');
 ok((await p.locator('#heroBuy').textContent())==='5,550','hero buy 21k');
 ok((await p.locator('#heroSpread').textContent()).includes('50'),'spread shown');
 ok((await p.locator('#heroTime').textContent()).includes('بدون مصنعية'),'excludes making charges note');
 const ch=await p.locator('#heroChange').textContent();
 ok(/[▲▼]/.test(ch)&&ch.includes(yest),'change vs last archived close with date');
 const tr=await p.locator('#gaugeNeedle').evaluate(e=>({t:e.style.transform,o:e.style.opacity}));
 ok(tr.t.includes('rotate(')&&!tr.t.includes('-90deg)'),'needle moves off zero with result');
 ok(tr.o==='1','needle fully visible with result');
 await p.locator('.x-karat[data-karat="24"]').click();await p.waitForTimeout(120);
 ok((await p.locator('#heroPrice').textContent())==='6,400','24k price after chip click');
 ok(await p.evaluate(()=>localStorage.getItem('dhb-karat'))==='24','karat persists to localStorage');
 await p.reload({waitUntil:'load'});await p.waitForTimeout(300);
 ok(await p.locator('.x-karat[data-karat="24"]').getAttribute('aria-pressed')==='true','karat selection survives reload');
 await fire(p,isaghaDetail());await p.waitForTimeout(150);
 ok((await p.locator('#heroPrice').textContent())==='6,400','24k price after reload+event');
 await p.locator('.x-karat[data-karat="18"]').click();await p.waitForTimeout(120);
 ok((await p.locator('#heroPrice').textContent())==='4,800','18k derived from 24k by purity');
 ok((await p.locator('#heroTime').textContent()).includes('محسوب من عيار 24'),'18k derivation disclosed');
 await fire(p,{sources:{isagha:{status:'unavailable',sourceTime:nowIso()}},result:null});await p.waitForTimeout(150);
 ok((await p.locator('#heroPrice').textContent())==='—','unavailable quote shows dash, never a guess');
 ok((await p.locator('#heroTime').textContent()).includes('غير متاح'),'unavailable state disclosed');
 await p.close();await c.close();
}
/* ---------- live chart ---------- */
{
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));
 await c.route('https://**/*',r=>r.abort());
 await c.route('**/history.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({points:[{d:'2026-11-20',usd:4100},{d:'2026-11-21',usd:4125.5}]})}));
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/market/#live',{waitUntil:'load'});
 await p.waitForTimeout(500);
 ok(await p.locator('#chartSession').getAttribute('aria-pressed')==='true','session mode default');
 ok((await p.locator('#liveChartStatus').textContent()).includes('في انتظار'),'empty session disclosed');
 await fire(p,{sources:{gold:{status:'available',sell:4150.25,sourceTime:nowIso()}}});await p.waitForTimeout(150);
 ok((await p.locator('#chartValue').textContent())==='4,150.25','session value from quote');
 ok(await p.locator('#nativeChart svg circle').count()===1,'single reading drawn as a point');
 ok((await p.locator('#liveChartStatus').textContent()).includes('قراءة واحدة'),'single-reading wording, not a fake trend');
 await fire(p,{sources:{gold:{status:'available',sell:4160.5,sourceTime:new Date(Date.now()+60000).toISOString()}}});await p.waitForTimeout(150);
 ok(await p.locator('#nativeChart svg path').count()>=1,'two readings draw a path');
 const stale=new Date(Date.now()-25*3600000).toISOString();
 await fire(p,{sources:{gold:{status:'available',sell:9999,sourceTime:stale}}});await p.waitForTimeout(150);
 ok((await p.locator('#chartValue').textContent())==='4,160.5','stale quote ignored');
 await p.locator('#chartHistory').click();await p.waitForTimeout(200);
 ok((await p.locator('#chartValue').textContent())==='4,125.5','history mode shows last daily close');
 ok((await p.locator('#nativeChart svg').getAttribute('aria-label')).length>10,'chart has an accessible label');
 await p.close();await c.close();
}
/* ---------- comparison tool ---------- */
{
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));
 await c.route('https://**/*',r=>r.abort());
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/products/bar5/',{waitUntil:'load'});
 await p.waitForTimeout(400);
 ok(await p.locator('#compareEmpty').isVisible(),'empty comparison disclosed');
 ok((await p.locator('#compareSummary').textContent()).includes('أضف منتجين'),'asks for two products');
 await p.fill('#compareName','سيئ');await p.fill('#compareWeight','0');await p.selectOption('#compareKarat','21');await p.fill('#compareTotal','1000');
 await p.locator('#compareForm button[type=submit]').click();await p.waitForTimeout(100);
 ok(await p.locator('.compare-card').count()===0,'zero weight rejected');
 await p.fill('#compareName','أ');await p.fill('#compareWeight','10');await p.fill('#compareTotal','60000');await p.evaluate(()=>{const b=document.getElementById('compareFinal');b.checked=true;});
 await p.locator('#compareForm button[type=submit]').click();await p.waitForTimeout(100);
 await p.fill('#compareName','ب');await p.fill('#compareWeight','٨');await p.selectOption('#compareKarat','24');await p.fill('#compareTotal','62000');await p.evaluate(()=>{const b=document.getElementById('compareFinal');b.checked=true;});
 await p.locator('#compareForm button[type=submit]').click();await p.waitForTimeout(150);
 ok(await p.locator('.compare-card').count()===2,'two cards added (Arabic-Indic weight parsed)');
 ok(await p.locator('.compare-card.compare-best').count()===1,'exactly one winner');
 ok((await p.locator('.compare-card.compare-best h3').textContent())==='أ','winner is lowest per pure 24k gram');
 ok((await p.locator('.compare-card.compare-best').textContent()).includes('أقل تكلفة للجرام الصافي'),'winner explains the basis');
 ok((await p.locator('.compare-card').first().textContent()).includes('8.75'),'pure-gram equivalent shown');
 await p.locator('.compare-remove').first().click();await p.waitForTimeout(100);
 ok(await p.locator('.compare-card').count()===1,'removal works');
 await p.reload({waitUntil:'load'});await p.waitForTimeout(300);
 ok(await p.locator('.compare-card').count()===1,'comparison persists across reload');
 await p.evaluate(()=>dispatchEvent(new CustomEvent('dhb-compare-add',{detail:{name:'جنيه ذهب',weight:8,karat:21,total:51000,buyback:48000}})));await p.waitForTimeout(150);
 ok((await p.locator('#compareName').inputValue())==='جنيه ذهب'&&(await p.locator('#compareWeight').inputValue())==='8','cross-screen prefill lands in the form');
 ok((await p.locator('#compareMessage').textContent()).includes('راجع الإجمالي'),'prefill asks for review, not blind add');
 ok(await p.evaluate(()=>document.activeElement.id==='compareName'),'prefill focuses the form');
 await p.close();await c.close();
}
console.log(checks+' market/live/comparison functional assertions passed.');
}catch(e){console.error('FAIL',e.message.slice(0,500));process.exitCode=1}
finally{await b.close();server.close();}
})();
