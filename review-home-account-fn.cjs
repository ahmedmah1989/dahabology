/* Home quotes data rules + signed-out account screen. Fresh synthetic quotes through the wire,
   staleness and unavailability must render as disclosed states, never guessed numbers. */
const assert=require('assert/strict');let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++};
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'dist');
const serve=async()=>new Promise(r=>{const s=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f))});s.listen(0,()=>r(s))});
const quotes=ageHours=>({schemaVersion:1,generatedAt:new Date().toISOString(),sources:{
 isagha:{sourceTime:new Date(Date.now()-ageHours*3600000).toISOString(),status:'available','24':{sell:6400,buy:6350},'21':{sell:5600,buy:5550}},
 isagha_silver:{sourceTime:new Date(Date.now()-ageHours*3600000).toISOString(),status:'available',sell:80},
 cbe:{quoteDate:new Date().toISOString().slice(0,10),status:'available',sell:47.5}}});
(async()=>{
const server=await serve();
const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
/* ---- home with fresh local quotes, global feeds down ---- */
{
 const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));
 await c.route('https://api.gold-api.com/**',r=>r.abort());
 await c.route('**/gold-board/data/quotes.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(quotes(0))}));
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'load'});
 await p.waitForTimeout(800);
 ok((await p.locator('#p21').textContent())==='5,600','21k sell from fresh quote');
 ok((await p.locator('#p24').textContent())==='6,400','24k sell');
 ok((await p.locator('#p18').textContent())==='4,800','18k derived from 24k by purity');
 ok((await p.locator('#pWhen').textContent()).includes('بدون مصنعية'),'making-charges exclusion stated');
 ok((await p.locator('#pOz').textContent())==='—','global ounce dash when feed down');
 ok((await p.locator('#pOzTime').textContent()).includes('غير متاحة'),'ounce unavailability disclosed');
 ok((await p.locator('#pUsd').textContent())==='47.5','CBE reference dollar shown');
 ok((await p.locator('#pImplied').textContent())==='—','implied dollar needs the ounce, stays dash');
 ok((await p.locator('#pImpliedTime').textContent()).includes('ناقصة'),'implied dollar gap explained');
 await p.close();await c.close();
}
/* ---- home with a 25-hour-old quote: staleness wins over cached numbers ---- */
{
 const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));
 await c.route('https://**/*',r=>r.abort());
 await c.route('**/gold-board/data/quotes.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(quotes(25))}));
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'load'});
 await p.waitForTimeout(800);
 ok((await p.locator('#p21').textContent())==='—','stale local quote never shown as current');
 ok((await p.locator('#pSourceTime').textContent()).length>3,'staleness described next to the price');
 await p.close();await c.close();
}
/* ---- account screen signed out ---- */
{
 const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));
 await c.route('https://**/*',r=>r.abort());
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/account-preview/',{waitUntil:'load'});
 await p.waitForTimeout(600);
 ok(await p.locator('#authForm').isVisible(),'sign-in form shown signed out');
 ok(await p.locator('#em').isVisible()&&await p.locator('#pw').isVisible(),'email and password fields');
 ok(await p.evaluate(()=>localStorage.getItem('dahabology.session.v1')===null),'no session fabricated');
 ok((await p.locator('#list').textContent()).trim().length<40,'no account data rendered signed out');
 await p.close();await c.close();
}
console.log(checks+' home/account functional assertions passed.');
}catch(e){console.error('FAIL',e.message.slice(0,400));process.exitCode=1}
finally{await b.close();server.close();}
})();
