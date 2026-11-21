const { chromium } = require('playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.join(__dirname,'dist'),OUT='/downloads/dahab-review';fs.mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((req,res)=>{let f=path.join(ROOT,decodeURI(req.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));});
const stub=`const copy=x=>JSON.parse(JSON.stringify(x));
let u={uid:'synthetic-review',email:'review@example.invalid',emailVerified:true};const listeners=[];
export const currentUser=()=>u;
export const onChange=f=>{listeners.push(f);f(u);};
export const loadDoc=async p=>copy(window.__doc);
export const updateGoldItems=async f=>{const r=f(copy(window.__doc.items),copy(window.__doc.invoices),copy(window.__doc.silver));Object.assign(window.__doc,r);window.__writes=(window.__writes||0)+1;return copy(r);};
export const validateSession=async()=>u;
export const signIn=async()=>u;export const signUp=signIn;
export const signOut=async()=>{u=null;listeners.forEach(f=>f(null));};
export const refreshVerification=async()=>u;export const resendVerification=async()=>{};export const sendPasswordReset=async()=>{};`;
let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++;};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({headless:true,executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
for(const width of [320,390,768,1280]){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});let errors=[],profile='valid';
 await context.addInitScript(()=>{window.__doc={items:[{id:'legacy',type:'bar',karat:21,grams:16,qty:2,unitGrams:8,paid:12345,unknown:'preserve',purchaseDate:'2025-01-01'}],silver:[{id:'silver-old',type:'jewelry',metal:'silver',fineness:925,grams:9,purchaseDate:'2025-02-02',purpose:'adornment'}],invoices:[{id:'old-invoice',vatMode:'has',subtotal:1000,vat:150,total:1150}]};localStorage.setItem('dhb-motion','paused');localStorage.setItem('dahabology.session.v1','synthetic-session-never-sent');});
 await context.route('**/*',async route=>{const u=route.request().url(),now=new Date().toISOString(),day=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Cairo'});let body;
 if(/identitytoolkit|firestore|securetoken/.test(u))throw Error('Attempted real backend '+u);
 if(u.includes('/js/account.js'))return route.fulfill({contentType:'text/javascript',body:stub});
 if(u.includes('quotes.json'))body={schemaVersion:1,sources:{isagha:{status:'available',sourceTime:now,'24':{sell:6400,buy:6300},'21':{sell:5600,buy:5500}},cbe:{status:'available',sell:53.8629,buy:53.7629,quoteDate:day},misr:{status:'available',sell:999,sourceTime:now},gold:{status:'available',sell:4000,sourceTime:now},isagha_silver:{status:'available',sourceTime:now,currency:'EGP',unit:'gram',unitBasis:'inferred',grades:{'999':{sell:110,buy:105},'925':{sell:100,buy:95}}}}};
 else if(u.includes('api.gold-api.com/price/XAU'))body={symbol:'XAU',currency:'USD',price:4000,updatedAt:now};
 else if(u.includes('api.gold-api.com/price/XAG'))body={symbol:'XAG',currency:'USD',price:42.5,updatedAt:now};
 else if(u.includes('offers.json'))body={catalog:[]};
 else if(u.includes('local-history.json'))body={days:[]};
 else if(u.startsWith('https://'))return route.abort();
 if(body&&u.includes('quotes.json')){if(profile==='missing-cbe')delete body.sources.cbe;if(profile==='stale-gold')body.sources.isagha.sourceTime='2025-01-01T00:00:00Z';if(profile==='missing-local')delete body.sources.isagha;}
 if(body)return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/');await page.waitForFunction(()=>document.getElementById('pSilver')?.textContent==='42.5');
 ok(await page.locator('#p18').textContent()==='4,800','18 derived from 24');ok(await page.locator('#pUsd').textContent()==='53.86','CBE not Misr');ok(await page.locator('#pSilverLocal').textContent()==='110','numeric local silver');
 const bounds=await page.evaluate(()=>['pUsd','pImplied'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y};}));ok(Math.abs(bounds[0].y-bounds[1].y)<2,'FX adjacent');
 await page.screenshot({path:OUT+'/home-'+width+'.png',fullPage:true});
 ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'home fits');
 ok(await page.evaluate(()=>document.getElementById('pSilverLocal').getBoundingClientRect().bottom<document.getElementById('stage').getBoundingClientRect().top),'all master prices above navigation');
 ok(await page.evaluate(()=>!document.getElementById('stage').closest('.home-market')),'navigation not nested in card');
 await page.goto(url+'/market/');await page.waitForFunction(()=>document.getElementById('priceBank')?.textContent.includes('53.86'));
 ok((await page.locator('#qualityText').textContent()).includes('مرجعية'),'dated reference label');
 await page.locator('#comparison summary').click();ok(!(await page.locator('#qualityText').textContent()).includes('بنك مصر'),'no hidden Misr claim');
 const expect=6400/(4000/31.1034768)/53.8629*100-100;
 const text=await page.locator('#fxPercent').textContent();ok(text.includes(Math.abs(expect).toFixed(2).slice(0,-1)),'gauge uses CBE');
 await page.screenshot({path:OUT+'/market-'+width+'.png',fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'market fits');
 await page.goto(url+'/account-preview/');await page.waitForSelector('#inn:not([hidden])');
 ok((await page.locator('#list').textContent()).includes('الغرض غير مسجّل'),'legacy purpose not invented');
 const order=await page.evaluate(()=>{const ids=['iType','iSizes','iKarat','iGrams'];return ids.map(id=>document.getElementById(id).getBoundingClientRect().top)});ok(order.every((v,i)=>!i||v>=order[i-1]),'type choices karat manual weight order');
 for(const metal of ['gold','silver'])for(const type of ['bar','coin','jewelry','scrap']){
 await page.selectOption('#iMetal',metal);await page.selectOption('#iType',type);ok(await page.locator('#iPur').isVisible(),metal+type+' purpose visible');
 await page.fill('#iGrams','5');await page.fill('#iDate','2025-04-01');await page.locator('[name=iP][value=adornment]').check();await page.click('#iSave');await page.waitForFunction(n=>(window.__writes||0)>=n,1+(['gold','silver'].indexOf(metal)*4+['bar','coin','jewelry','scrap'].indexOf(type)));
 const saved=await page.evaluate(()=>window.__doc);const list=metal==='gold'?saved.items:saved.silver;ok(list.at(-1).purpose==='adornment','purpose saved '+metal+type);ok(saved.items[0].unknown==='preserve'&&saved.items[0].qty===2&&saved.items[0].paid===12345,'legacy metadata preserved');ok(saved.invoices[0].total===1150,'invoice preserved');
 }
 await page.selectOption('#iMetal','gold');await page.selectOption('#iType','bar');await page.click('#iSizes [data-w="10"]');ok(await page.inputValue('#iGrams')==='10','bar chip propagates');ok(await page.inputValue('#iKarat')==='24','new bar24');ok(await page.locator('#iKarat').isDisabled(),'new bar locked');
 await page.fill('#iGrams','3.125');ok(await page.inputValue('#iGrams')==='3.125','custom weight kept');
 await page.fill('#iGrams','٥');ok(await page.locator('#iSizes [data-w="5"]').getAttribute('aria-pressed')==='true','Arabic manual weight highlights matching chip');await page.fill('#iGrams','3.125');
 await page.locator('#itemForm').scrollIntoViewIfNeeded();await page.locator('#itemForm').screenshot({path:OUT+'/account-form-'+width+'.png'});await page.screenshot({path:OUT+'/account-'+width+'.png',fullPage:true});
 await page.locator('[data-id=legacy] [data-act=edit]').click();ok(await page.inputValue('#iKarat')==='21','legacy bar21 kept');await page.fill('#iLabel','Updated synthetic');await page.locator('[name=iP][value=saving]').check();await page.click('#iSave');await page.waitForFunction(()=>window.__doc.items[0].label==='Updated synthetic');
 ok(await page.evaluate(()=>window.__doc.items[0].grams===16&&window.__doc.items[0].unitGrams===8&&window.__doc.items[0].unknown==='preserve'),'legacy qty weight unknown after edit');
 ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'account fits');ok(errors.length===0,'no JS errors: '+errors.join(','));



 if(width===390){
  profile='missing-cbe';await page.goto(url+'/');await page.waitForFunction(()=>document.getElementById('pImplied').textContent!=='—');ok(await page.locator('#pUsd').textContent()==='—','no Misr fallback on home');ok(await page.locator('#pImplied').textContent()==='49.77','implied independent of missing CBE');
  await page.goto(url+'/market/');await page.waitForFunction(()=>document.getElementById('impVal').textContent.includes('49.77'));ok(await page.locator('#gapBig').textContent()==='—','comparison waits for CBE');ok((await page.locator('#referenceBasis').textContent()).includes('لا نستخدم'),'missing CBE warning visible');
  profile='stale-gold';await page.goto(url+'/');await page.waitForFunction(()=>document.getElementById('pUsd').textContent==='53.86');ok(await page.locator('#p18').textContent()==='—','stale derived18 hidden');ok(await page.locator('#pImplied').textContent()==='—','stale local input blocks implied');ok((await page.locator('#pSourceTime').textContent()).includes('24'),'stale source warning visible');
  profile='missing-local';await page.goto(url+'/analysis/');await page.waitForFunction(()=>document.getElementById('usd').value!=='');ok(await page.inputValue('#usd')==='53.8629','analysis uses CBE without local gold');ok(await page.inputValue('#oz')==='4000','analysis global independent of local gold');ok(await page.inputValue('#loc')==='','analysis never invents local gold');
  profile='valid';
 }
 if(width<600){
  await page.goto(url+'/wallet/');await page.waitForSelector('#invRows [data-f=type]');
  let n=0;
  for(const type of ['bar','coin','jewelry','scrap'])for(const purpose of ['adornment','saving']){
   await page.fill('#walDD','1');await page.fill('#walMM','4');await page.fill('#walYY','2025');
   await page.selectOption('#invRows [data-f=type]',type);
   if(type!=='bar')await page.selectOption('#invRows [data-f=k]','21');
   if(type==='bar'){await page.locator('#invRows [data-w="10"]').tap();ok(await page.locator('#invRows [data-f=gw]').inputValue()==='10','invoice chip propagates');}
   await page.fill('#invRows [data-f=qty]','2');await page.locator('#invRows [data-f=qty]').press('Tab');
   await page.fill('#invRows [data-f=gw]','1');await page.fill('#invRows [data-f=gf]','125');await page.fill('#invRows [data-f=p]','1150');
   await page.locator('#invRows [data-s=without]').tap();
   ok(await page.locator('#invRows [data-pp='+purpose+']').isVisible(),'wallet purpose shown '+type);
   await page.locator('#invRows [data-pp='+purpose+']').tap();
   await page.locator('#invTax summary').click();await page.locator('#taxMode [data-m=has]').click();await page.fill('#t_pre','1000');
   await page.locator('#h14').click();await page.fill('#t_vat','150');await page.locator('#t_vat').press('Tab');
   ok(await page.inputValue('#t_post')==='1150.00','tax calculated total recomputes');
   await page.locator('#walRev').check();ok(await page.locator('#walAdd').isEnabled(),'valid invoice save enabled');
   await page.locator('#walAdd').tap();await page.waitForFunction(n=>window.__writes>=n,++n);
   const doc=await page.evaluate(()=>window.__doc),last=doc.items.at(-1);
   ok(last.purpose===purpose&&last.type===type,'wallet persisted explicit purpose');ok(last.grams===2.25&&last.unitGrams===1.125&&last.qty===2,'unit/total weights correct');
   ok(doc.invoices.at(-1).total===1150&&doc.invoices.at(-1).vat===150,'revised tax persisted');ok(doc.silver[0].id==='silver-old'&&doc.items[0].unknown==='preserve','cross-type existing records preserved');
  }
 }
 if(width<600){
  const cases=['9,999,999.99','−9,999,999.99','+999,999.99%','−999,999.99%'];
  for(const [pagePath,id] of [['market','heroPrice'],['wallet','walNow'],['calculator','cResult'],['invoice','invDonutPct']]){
   await page.goto(url+'/'+pagePath+'/');await page.waitForSelector('#'+id);await page.waitForTimeout(100);
   for(const text of cases){
    await page.evaluate(({id,text})=>{
     document.getElementById(id).textContent=text;
     const change=document.getElementById('walDiff');if(change)change.textContent='−9,999,999.99 (−999.99%)';
     const heroChange=document.getElementById('heroChange');if(heroChange){heroChange.innerHTML='<span class="change-amount">−999,999.99%</span><span class="change-reference">عن إغلاق <bdi dir="ltr">2026-11-20</bdi></span>';}
     window.DHB_FIT_NUMBERS();
    },{id,text});
    await page.waitForTimeout(50);
    const fit=await page.evaluate(id=>{
     const el=document.getElementById(id),ring=el.closest('.x-ring,.x-donut'),r=ring.getBoundingClientRect();
     const range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2,rad=r.width/2;
     const corners=[[t.left,t.top],[t.right,t.top],[t.left,t.bottom],[t.right,t.bottom]];
     return {text:el.textContent,lines:range.getClientRects().length,inside:corners.every(([x,y])=>Math.hypot(x-cx,y-cy)<=rad),nowrap:getComputedStyle(el).whiteSpace,width:t.width,font:getComputedStyle(el).fontSize};
    },id);
    ok(fit.text===text,'full numeric string retained '+pagePath);ok(fit.lines===1,'one line '+pagePath+' '+JSON.stringify(fit));ok(fit.inside,'inside circle '+pagePath+' '+JSON.stringify(fit));
   }
   await page.locator('#'+id).scrollIntoViewIfNeeded();await page.screenshot({path:OUT+'/stress-'+pagePath+'-'+width+'.png'});
  }
 }
 await context.close();
}
console.log(JSON.stringify({checks,status:'PASS',screenshots:OUT},null,2));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
