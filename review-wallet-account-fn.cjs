/* Wallet/account functional closure: ledger arithmetic and record building as pure node tests
   (unknown stays unknown, paid total authoritative, Arabic-Indic input, no guessed values),
   plus signed-out DOM behavior: the wallet never saves without a verified account. */
const assert=require('assert/strict');let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++};
const L=require('./public/js/ledger-model.js');
const W=require('./public/js/wallet-account.js');
const P=(v,k)=>L.parseNumber(v,k);

/* ---- parseNumber: strict, locale-aware, never guessing ---- */
ok(P('46,000','money').value===46000,'money thousands comma');
ok(P('46.000','money').error==='ambiguous','money dot-3digits refused as ambiguous, not guessed');
ok(P('3,125','grams').value===3.125,'grams comma is decimal');
ok(P('٣٫١٢٥','grams').value===3.125,'Arabic-Indic digits with Arabic decimal mark');
ok(P('١٢٣','money').value===123,'Arabic-Indic integer');
ok(P('12abc','money').error==='format','letters rejected');
ok(P('','money').blank===true,'blank stays blank, not zero');
ok(P('1,234,567','money').value===1234567,'grouped thousands');
ok(P('1.2345','grams').error==='precision','milligram precision limit');
ok(P('0.5','money').value===0.5,'plain decimal');

/* ---- buildRecord: validation and shape ---- */
const base={id:'a1',k:'21',g:8,paid:48000,note:'خاتم زواج'};
const good=W.buildRecord(base,{type:'jewelry',date:'2026-01-15',purpose:'adornment'});
ok(good.rec&&good.rec.karat===21&&good.rec.grams===8,'valid record built');
ok(good.rec.purpose==='adornment','jewelry purpose recorded');
ok(W.buildRecord({...base,k:'22'},{type:'bar',date:'2026-01-15'}).error,'bad karat rejected');
ok(W.buildRecord({...base,g:0},{type:'bar',date:'2026-01-15'}).error,'zero grams rejected');
ok(W.buildRecord(base,{type:'ring',date:'2026-01-15'}).error,'unknown type rejected');
ok(W.buildRecord(base,{type:'bar',date:'15/01/2026'}).error,'bad date rejected');
ok(W.buildRecord(base,{type:'jewelry',date:'2026-01-15'}).error,'jewelry without purpose rejected');
const long=W.buildRecord({...base,note:'x'.repeat(60)},{type:'bar',date:'2026-01-15'});
ok(long.rec.label.length===40,'label truncated to 40 chars');

/* ---- merge/remove: no duplicates, no touching others ---- */
const m1=W.mergeItem([],good.rec);ok(m1.added===true&&m1.items.length===1,'first add lands');
const m2=W.mergeItem(m1.items,good.rec);ok(m2.added===false&&m2.items.length===1,'same id never duplicated');
ok(W.removeItem(m1.items,'a1').length===0,'remove by id');

/* ---- toWalletItems: unpriced never valued as zero ---- */
const w=W.toWalletItems([{id:'1',karat:21,grams:8,paid:48000},{id:'2',karat:24,grams:5},{id:'3',karat:22,grams:1,paid:1}]);
ok(w.priced.length===1&&w.unpriced.length===1,'priced/unpriced split; invalid karat dropped');

/* ---- valuation: unknown stays unknown ---- */
const prices={21:{sell:5600,buy:5500},24:{sell:6400,buy:6350}};
const v1=L.valuation({karat:21,grams:8,paid:48000,making:2000,tax:500,stamp:100,stones:'without'},prices);
ok(Math.abs(v1.A.perGram-5675)<1e-9,'gold-only per-gram from recorded fees');
ok(v1.B.value===44000&&v1.B.diff===-4000,'resale value at buy price vs paid');
const v2=L.valuation({karat:21,grams:8,paid:48000,stones:'with',basis:'total',stoneG:1},prices);
ok(v2.net===7&&v2.A===null&&v2.whyNoA==='stones-cost-unknown','stones with: net weight known, gold price stays unknown');
ok(v2.B.value===38500,'resale still valued on net weight');
const v3=L.valuation({karat:21,grams:8,paid:48000,making:1,tax:1,stamp:1,stones:'without',additions:300},prices);
ok(v3.A===null&&v3.whyNoA==='legacy-additions','legacy additions never read as fees');
const v4=L.valuation({karat:18,grams:8,paid:1000,stones:'without',making:0,tax:0,stamp:0},prices);
ok(v4.whyNoA==='no-market-price'&&v4.whyNoB==='no-market-price','missing market price is stated, not guessed');
const v5=L.valuation({karat:21,grams:8,paid:48000,stones:'with',promise:'full'},prices);
ok(v5.promise&&v5.promise.guaranteed===false,'buy-back promise is separate and never guaranteed');

/* ---- aggregate: totals only over covered pieces ---- */
const agg=L.aggregate([
 {karat:21,grams:8,paid:48000,stones:'without'},
 {karat:24,grams:5,paid:30000},
 {karat:21,grams:2}
],prices);
ok(agg.count===3&&agg.paidAll===78000,'paid total over priced pieces');
ok(agg.covered===1&&agg.unpriced===1&&agg.noGoldWeight===1&&agg.partial===true,'coverage disclosed, unknown never zeroed');
ok(agg.now===44000&&agg.diff===44000-48000,'resale diff only on covered pieces against their own paid');

/* ---- signed-out DOM: nothing saves without a verified account ---- */
(async()=>{
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'dist');
const server=await new Promise(r=>{const s=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f))});s.listen(0,()=>r(s))});
const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
 const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await c.addInitScript(()=>sessionStorage.setItem('dhb-intro','1'));
 await c.route('https://**/*',r=>r.abort());
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/wallet/',{waitUntil:'load'});
 await p.waitForTimeout(600);
 ok(await p.locator('#walForm').isVisible(),'wallet form present');
 ok(await p.locator('#walEmpty').isVisible(),'empty wallet disclosed with no pieces');
 ok(await p.locator('#walUnpriced').isHidden(),'unpriced note hidden when none');
 ok(await p.evaluate(()=>(window.DHB_CLOUD_ITEMS||[]).length===0),'no cloud items signed out');
 ok(await p.evaluate(()=>localStorage.getItem('dahabology.session.v1')===null),'no session fabricated');
 await p.close();await c.close();
 console.log(checks+' wallet/account functional assertions passed.');
}catch(e){console.error('FAIL',e.message.slice(0,400));process.exitCode=1}
finally{await b.close();server.close();}
})();
