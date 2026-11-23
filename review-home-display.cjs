const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=process.env.DHB_DISPLAY_OUT||'/downloads/dahab-display', root=__dirname, fixtures=path.join(__dirname,'review-fixtures/home-display');
fs.mkdirSync(out,{recursive:true});
const quotes=JSON.parse(fs.readFileSync(fixtures+'/quotes-live.json')),xau=JSON.parse(fs.readFileSync(fixtures+'/xau-live.json')),xag=JSON.parse(fs.readFileSync(fixtures+'/xag-live.json'));
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++};
const ids=['p21','p18','p24','pOz','pUsd','pImplied','pSilver','pSilverLocal'];
const statusIds=['pSourceTime','pOzTime','pUsdTime','pImpliedTime','pSilverTime','pSilverLocalTime'];
(async()=>{
const beforeRoot=process.env.DHB_DISPLAY_BEFORE||'/tmp/dahab-display-before';
const makeServer=async dir=>{const s=http.createServer((req,res)=>{let f=path.join(dir,decodeURIComponent(req.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));});await new Promise(r=>s.listen(0,'127.0.0.1',r));return s;};
const servers=[await makeServer(beforeRoot),await makeServer(root+'/dist')];
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
const results={fixtureCaptured:quotes.generatedAt};
for(const width of [320,390,1280]){
 let prior;
 for(const [i,label]of ['before','after'].entries()){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('https://**/*',async route=>{const u=route.request().url();const body=u.includes('quotes.json')?quotes:u.includes('/price/XAU')?xau:u.includes('/price/XAG')?xag:null;if(body)return route.fulfill({json:body,headers:{'X-DHB-Transport':'network'}});return route.abort();});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+servers[i].address().port+'/');await page.waitForFunction(()=>document.getElementById('p21').textContent!=='—');await page.waitForFunction(()=>document.getElementById('pSilver').textContent!=='—');
  const values=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id).textContent])),ids);
  if(i===0)prior=values;else{assert.deepEqual(values,prior);checks++;const status=await page.evaluate(ids=>ids.map(id=>document.getElementById(id).textContent),statusIds);ok(status.every(s=>s===''),'valid price provenance hidden');ok(await page.locator('#homeConnection').textContent()==='','valid network no warning');ok(await page.locator('#pUsdTime').evaluate(n=>getComputedStyle(n).display==='none'),'no empty status gap');const styles=await page.evaluate(()=>[...document.querySelectorAll('.home-karat-label')].map(n=>{const s=getComputedStyle(n);return {text:n.textContent,color:s.color,weight:+s.fontWeight,size:parseFloat(s.fontSize),fits:n.scrollWidth<=n.clientWidth+1||getComputedStyle(n).display==='inline'};}));ok(styles.length===3&&styles.every(s=>s.weight>=800&&s.size>=17),'karat labels large and heavy');ok(styles.every(s=>s.color!=='rgb(255, 255, 255)'),'gold labels distinct from white prices');ok(await page.locator('.hero-price>b').evaluate(n=>getComputedStyle(n).color==='rgb(255, 255, 255)'),'hero price white');ok(await page.locator('.price-board').count()===1,'single grouped quote board');ok(await page.locator('.price-board .chip').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).borderTopWidth==='0px'&&getComputedStyle(n).backgroundImage==='none')),'individual price tiles no longer boxed');}
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+label+' '+width);ok(errors.length===0,'no page errors');
  await page.screenshot({path:out+'/'+label+'-home-'+width+'.png',fullPage:true});results[label+'-'+width]=values;await context.close();
 }
}
for(const mode of ['expired','unavailable','cache','offline','invalidTime','future']){
 const q=structuredClone(quotes),a=structuredClone(xau),s=structuredClone(xag);
 if(['expired','invalidTime','future'].includes(mode)){
 const time=mode==='invalidTime'?'invalid':new Date(Date.now()+(mode==='future'?3600000:-25*3600000)).toISOString();
 for(const v of Object.values(q.sources))if(v&&typeof v==='object')v.sourceTime=time;
 a.updatedAt=time;s.updatedAt=time;if(mode==='expired')q.sources.cbe.quoteDate='2026-10-01';
 }
 if(mode==='unavailable'){for(const v of Object.values(q.sources))if(v&&typeof v==='object')v.status='unavailable';a.symbol='BAD';s.symbol='BAD';}
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 if(mode==='offline')await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
 await context.route('https://**/*',route=>{const u=route.request().url();const body=u.includes('quotes.json')?q:u.includes('/price/XAU')?a:u.includes('/price/XAG')?s:null;if(body)return route.fulfill({json:body,headers:{'Access-Control-Expose-Headers':'X-DHB-Transport','X-DHB-Transport':mode==='cache'||mode==='offline'?'cache':'network'}});return route.abort();});
 const page=await context.newPage();await page.goto('http://127.0.0.1:'+servers[1].address().port+'/');await page.waitForFunction(()=>!document.getElementById('homeConnection').textContent.includes('لم يُتحقق'));
 if(mode==='cache'||mode==='offline'){ok(/محفوظة/.test(await page.locator('#homeConnection').textContent()),'cache warning visible');ok((await page.locator('#p21').textContent())!=='—','usable cache retained with warning');}
 else{for(const id of ['p21','p18','p24','pOz','pImplied','pSilver','pSilverLocal'])ok(await page.locator('#'+id).textContent()==='—',mode+' blocks '+id);ok((await page.locator('#pSourceTime').textContent()).length>0,'invalid quote warning visible');ok(await page.locator('#pSourceTime').isVisible(),'warning not CSS hidden');}
 await page.screenshot({path:out+'/state-'+mode+'.png',fullPage:true});await context.close();
}
// Unchanged market DOM retains source and reference detail.
const c=await browser.newContext({serviceWorkers:'block'});await c.route('https://**/*',r=>{const u=r.request().url();if(u.includes('quotes.json'))return r.fulfill({json:quotes,headers:{'X-DHB-Transport':'network'}});if(u.includes('/price/XAU'))return r.fulfill({json:xau});if(u.includes('/price/XAG'))return r.fulfill({json:xag});return r.abort();});const p=await c.newPage();await p.goto('http://127.0.0.1:'+servers[1].address().port+'/market/');await p.waitForFunction(()=>document.getElementById('bankTime').textContent.includes('2026'));ok((await p.locator('#bankTime').textContent()).includes('2026'),'market bank date unchanged');ok((await p.locator('#silverLocalBrief').textContent()).includes('آي صاغة'),'market provenance unchanged');await c.close();
fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,results},null,2));console.log(checks+' home display assertions passed');
}finally{await browser.close();servers.forEach(s=>s.close());}
})().catch(e=>{console.error(e);process.exitCode=1;});
