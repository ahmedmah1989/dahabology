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
const probe=()=>{const l=document.getElementById('helpLauncher');const cs=getComputedStyle(l);const vis=cs.visibility!=='hidden'&&cs.opacity!=='0';const r=l.getBoundingClientRect();const hits=[];
 for(const e of document.querySelectorAll('main *')){const c=getComputedStyle(e);if(c.visibility==='hidden'||c.display==='none'||+c.opacity===0)continue;const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());const form=e.matches('input,select,textarea,button,a,img,svg');const chip=e.matches('[class*=chip],[class*=karat],[role=radio],[role=tab]');if(!own&&!form&&!chip)continue;let b=e.getBoundingClientRect();if(own&&!form&&!chip){const rg=document.createRange();const rs=[];for(const n of e.childNodes)if(n.nodeType===3&&n.textContent.trim()){rg.selectNodeContents(n);rs.push(...rg.getClientRects());}let hit=false;for(const q of rs){const w=Math.min(q.right,r.right)-Math.max(q.left,r.left),h=Math.min(q.bottom,r.bottom)-Math.max(q.top,r.top);if(w>2&&h>2)hit=true;}if(hit)hits.push('text:'+(e.id||e.className||e.tagName).toString().slice(0,30));continue;}if(b.width<2||b.height<2)continue;const w=Math.min(b.right,r.right)-Math.max(b.left,r.left),h=Math.min(b.bottom,r.bottom)-Math.max(b.top,r.top);if(w>2&&h>2)hits.push((e.id||e.className||e.tagName).toString().slice(0,30)+'@'+Math.round(b.left)+','+Math.round(b.top)+','+Math.round(b.width)+'x'+Math.round(b.height));}
 return {vis,rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],hits};};
(async()=>{server=await serve(root);const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
for(const vp of [{width:320,height:568},{width:360,height:640},{width:390,height:844}].filter(v=>!process.env.W||v.width==+process.env.W)){
 const c=await b.newContext({viewport:vp,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));await c.route('https://**/*',r=>r.abort());if(process.env.Q==='live')await c.route('https://ahmedmah1989.github.io/gold-board/data/quotes.json*',r=>r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('/tmp/q.json')}));
 for(const r of routes){
  const p=await c.newPage();await p.goto('http://127.0.0.1:'+server.address().port+r,{waitUntil:'load'});await p.waitForTimeout(700);
  const tag=r+' '+vp.width;
  const top=await p.evaluate(probe);
  ok(!top.vis||top.hits.length===0,'TOP REST no overlap '+tag+' '+JSON.stringify(top));
  if(r==='/calculator/'||r==='/calculator/#invoice')await p.screenshot({path:out+'/geo-'+(process.env.Q||'unavail')+'-'+vp.width+'-'+r.replace(/\W+/g,'_')+'.png'});
  const H=await p.evaluate(()=>document.documentElement.scrollHeight);let seenVis=top.vis;
  const ys=[];for(let y=0;y<=H;y+=60)ys.push(y);const seq=[...ys,...ys.slice().reverse()];
  for(const y of seq){await p.evaluate(y=>scrollTo(0,y),y);await p.waitForTimeout(220);const s=await p.evaluate(probe);if(s.vis)seenVis=true;ok(!s.vis||s.hits.length===0,'no overlap y='+y+' '+tag+' '+JSON.stringify(s));}
  const alt=await p.evaluate(()=>[...document.querySelectorAll('a[href$="/assistant/"]')].map(a=>!!a.closest('details,nav')));console.log(tag,'launcherSeen='+seenVis,'assistantLinks(inMenu)='+JSON.stringify(alt));ok(seenVis||alt.some(Boolean),'assistant reachable via launcher or menu link '+tag);
  await p.close();}
 await c.close();}
console.log(checks+' launcher geometry assertions passed.');
}catch(e){console.error('FAIL',e.message.slice(0,600));process.exitCode=1}finally{await b.close();server.close();}})();
