/* Launcher clearance: the floating مساعد launcher must never cover a field the user is
   typing in, and every form field must be able to scroll fully clear of its rest zone.
   320x568 and 390x844, calculator tabs + wallet + products + account forms. */
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++};
const root=path.join(__dirname,'dist'),out='/downloads/dahab-launcher-clearance';fs.mkdirSync(out,{recursive:true});
const serve=async dir=>{const s=http.createServer((req,res)=>{let f=path.join(dir,decodeURIComponent(req.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f))});await new Promise(r=>s.listen(0,'127.0.0.1',r));return s};
const routes=['/calculator/','/calculator/#invoice','/products/','/account-preview/','/wallet/'];
let server;
(async()=>{server=await serve(root);const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
for(const vp of [{width:320,height:568},{width:390,height:844}]){
const c=await b.newContext({viewport:vp,isMobile:true,hasTouch:true,serviceWorkers:'block'});
await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));
await c.route('https://**/*',r=>r.abort());
for(const r of routes){
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+r,{waitUntil:'load'});
 await p.waitForTimeout(400);
 ok(await p.locator('#helpLauncher').isVisible(),'launcher discoverable at rest '+r+' '+vp.width);
 // focus every form field: launcher must hide and the focused field must be fully uncovered
 const fields=await p.$$('main input,main select,main textarea');
 let focused=0;
 for(const f of fields){
  const id=await f.evaluate(e=>e.id||e.name||e.tagName);
  const vis=await f.isVisible();if(!vis)continue;
  await f.scrollIntoViewIfNeeded();await f.focus();await p.waitForTimeout(60);
  ok(!(await p.locator('#helpLauncher').isVisible()),'launcher hides on focus '+id+' '+r+' '+vp.width);focused++;
  // field must be fully clear of where the launcher sits (it is hidden, so just confirm not covered by it)
  const clear=await f.evaluate(()=>{const b=document.activeElement.getBoundingClientRect();const L=document.getElementById('helpLauncher').getBoundingClientRect();const hidden=getComputedStyle(document.getElementById('helpLauncher')).visibility==='hidden';return hidden||!(b.x<L.x+L.width&&b.x+b.width>L.x&&b.y<L.y+L.height&&b.y+b.height>L.y)});
  ok(clear,'focused field clear '+id+' '+r+' '+vp.width);
  await p.evaluate(()=>document.activeElement.blur());await p.waitForTimeout(60);
  const atTop=await p.evaluate(()=>scrollY<=24);
  if(atTop)ok(await p.locator('#helpLauncher').isVisible(),'launcher returns after blur '+id+' '+r+' '+vp.width);
  else{ok(!(await p.locator('#helpLauncher').isVisible()),'launcher stays away while scrolled '+id+' '+r+' '+vp.width);await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(120);ok(await p.locator('#helpLauncher').isVisible(),'launcher returns at top after blur '+id+' '+r+' '+vp.width);}
 }
 ok(focused>0,'form fields exercised '+r+' '+vp.width);
 // every field can scroll fully clear of the launcher rest zone (manual scroll reach)
 const fieldCount=await p.evaluate(()=>[...document.querySelectorAll('main input,main select,main textarea')].filter(e=>e.offsetParent).length);
 for(let fi=0;fi<fieldCount;fi++){
  const st=await p.evaluate(i=>{const l0=document.getElementById('helpLauncher');const els=[...document.querySelectorAll('main input,main select,main textarea')].filter(e=>e.offsetParent);const e=els[i];const r0=e.getBoundingClientRect();const maxScroll=document.documentElement.scrollHeight-innerHeight;const target=Math.max(0,Math.min(maxScroll,scrollY+(r0.bottom-(innerHeight-200))));scrollTo(0,target);return e.id||e.name||i},fi);
  await p.waitForTimeout(140);
  const clear=await p.evaluate(i=>{const l0=document.getElementById('helpLauncher');const hid=getComputedStyle(l0).visibility!=='visible';if(hid)return true;const L=l0.getBoundingClientRect();const els=[...document.querySelectorAll('main input,main select,main textarea')].filter(e=>e.offsetParent);const b=els[i].getBoundingClientRect();return !(b.x<L.x+L.width&&b.x+b.width>L.x&&b.y<L.y+L.height&&b.y+b.height>L.y)},fi);
  ok(clear,'field scrolls clear of launcher zone '+st+' '+r+' '+vp.width);
 }
 // explanatory/helper text and pane content must be uncovered while reading:
 // scroll down through the whole pane in steps; once past the entry threshold the
 // launcher must be hidden, so no text passes under it; scrolling back restores it.
 await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(120);
 ok(await p.locator('#helpLauncher').isVisible(),'launcher visible at page top '+r+' '+vp.width);
 let covered=[];
 for(let y=120;y<=2400;y+=240){await p.evaluate(d=>scrollTo(0,d),y);await p.waitForTimeout(140);
  const st=await p.evaluate(()=>{const l=document.getElementById('helpLauncher');const vis=getComputedStyle(l).visibility==='visible';let cov=null;if(vis){const L=l.getBoundingClientRect();const el=document.elementFromPoint(L.x+L.width/2,L.y+L.height/2);if(el&&el.closest('main'))cov=(el.textContent||'').trim().slice(0,30);}return {vis,cov}});
  ok(!st.vis,'launcher hides while scrolling down y='+y+' '+r+' '+vp.width);
  if(st.cov)covered.push(y+':'+st.cov);
 }
 ok(covered.length===0,'no visible text under launcher while reading '+r+' '+vp.width+(covered.length?' COVERED:'+covered.join('|'):''));
 // small upward scrolls must not restore the launcher over fields or text:
 // walk upward in small steps; whenever the launcher is visible its zone must be clear.
 for(let y=0;y<8;y++){await p.evaluate(()=>scrollTo(0,Math.max(0,scrollY-160)));await p.waitForTimeout(140);
  const up=await p.evaluate(()=>{const l=document.getElementById('helpLauncher');const vis=getComputedStyle(l).visibility==='visible';if(!vis)return {vis,cov:null};const L=l.getBoundingClientRect();const el=document.elementFromPoint(L.x+L.width/2,L.y+L.height/2);const cov=el&&el.closest('main')&&!/^(HTML|BODY|MAIN)$/.test(el.tagName)?(el.textContent||el.id||'').trim().slice(0,30):null;return {vis,cov}});
  ok(!up.cov,'scroll-up step '+y+' restores no overlap '+r+' '+vp.width+(up.cov?' COVERED:'+up.cov:''));
 }
 await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(140);
 ok(await p.locator('#helpLauncher').isVisible(),'launcher returns at page top '+r+' '+vp.width);
 // launcher still opens the dialog and closes cleanly
 await p.locator('#helpLauncher').click();ok(await p.locator('#helpDialog').isVisible(),'launcher opens dialog '+r+' '+vp.width);
 await p.locator('#helpQuestion').focus();ok(await p.locator('#helpDialog').isVisible(),'dialog stays open when its own field focused '+r+' '+vp.width);
 await p.locator('#helpClose').click();await p.waitForTimeout(60);await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(140);ok(await p.locator('#helpLauncher').isVisible(),'launcher back after dialog close '+r+' '+vp.width);
 await p.close();
}
await c.close();}
console.log(checks+' launcher clearance assertions passed.');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
