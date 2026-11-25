/* Wallet export closure: CSV builder rules (formula guard, blank-means-unrecorded, BOM,
   source column, filename) + browser download through the real click path, including the
   account-identity race abort and the empty-wallet refusal. Synthetic data only. */
const assert=require('assert/strict');let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++};
const X=require('./public/js/wallet-export.js');

/* ---- CSV builder ---- */
const day='2026-11-25';
const items=[
 {id:'a1',k:'21',g:8,paid:48000,note:'خاتم زواج',where:'account',rec:{type:'jewelry',karat:21,grams:8,purchaseDate:'2026-01-15',paid:48000,label:'خاتم زواج',making:2000,tax:0,stamp:100,stones:'without',invoiceId:'inv-1'}},
 {id:'d1',k:'24',g:5,paid:0,note:'',where:'device'},
 {id:'x1',k:'21',g:1.5,paid:9000,note:'=HYPERLINK("http://evil")',where:'device',rec:{type:'bar',karat:21,grams:1.5,purchaseDate:'2025-12-01',paid:9000,stones:'with'}}
];
const csv=X.buildCsv(items,day);
ok(csv.charCodeAt(0)===0xFEFF,'BOM first for Arabic Excel');
const lines=csv.split('\r\n');
ok(lines[0].includes('المدفوع (جنيه)')&&lines[0].includes('المصدر'),'Arabic headers with source column');
ok(lines[1].includes('خاتم زواج')&&lines[1].includes('مصوغات')&&lines[1].includes('في الحساب')&&lines[1].includes('inv-1'),'account row with type/source/invoice');
ok(lines[1].includes('2026-01-15')&&/[,]48000[,]/.test(lines[1]),'purchase date and paid as saved');
ok(lines[1].includes(',2000,0,100,'),'fees as saved: making 2000, zero tax stays 0, stamp 100');
ok(lines[2].includes(',0,'),'paid 0 stays 0, never blanked');
ok(!lines[2].includes('في الحساب')&&lines[2].includes('على الجهاز'),'device source column');
ok(lines[3].includes("'=HYPERLINK"),'formula cell guarded with quote prefix');
ok(!/"=HYPERLINK/.test(lines[3].split("'")[0]),'guard applied before quoting');
ok(csv.includes('غير مسجلة، وليست صفرًا'),'footer states blank-means-unrecorded');
const bare=X.buildCsv([{id:'n',k:'21',g:2,where:'device',rec:{type:'coin',karat:21,grams:2}}],day).split('\r\n')[1].split(',');ok(bare.slice(4,10).every(f=>f===''),'missing date/paid/fees/stones export blank, not zero');
ok(X.filename('2026-11-25')==='dahabology-wallet-2026-11-25.csv','dated filename');
ok(X.cell('a,b')==='"a,b"'&&X.cell('say "hi"')==='"say ""hi"""','CSV quoting');

/* ---- browser: real click path ---- */
(async()=>{
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'dist');
const server=await new Promise(r=>{const s=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f))});s.listen(0,()=>r(s))});
const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
 const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
 await c.addInitScript(()=>{sessionStorage.setItem('dhb-intro','1');localStorage.setItem('dhb-wallet-v1',JSON.stringify([{id:'d1',k:'21',g:8,paid:48000,note:'سبيكة جهاز'}]));});
 await c.route('https://**/*',r=>r.abort());
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/wallet/',{waitUntil:'load'});
 await p.waitForTimeout(600);
 ok(await p.locator('#walExport').isVisible(),'export button appears with pieces');
 const dl=p.waitForEvent('download',{timeout:5000});
 await p.locator('#walExport').click();
 const d=await dl;
 ok(/dahabology-wallet-\d{4}-\d{2}-\d{2}\.csv/.test(d.suggestedFilename()),'dated csv filename on download');
 const fp=await d.path();const body=fs.readFileSync(fp,'utf8');
 ok(body.includes('سبيكة جهاز')&&body.includes('على الجهاز'),'download contains the device piece with source');
 ok(body.charCodeAt(0)===0xFEFF,'downloaded file keeps BOM');
 // account piece mixed in, then an identity change mid-export aborts with no file
 await p.evaluate(()=>{window.DHB_CLOUD_ITEMS=[{id:'a9',k:'24',g:2,paid:13000,note:'قطعة حساب',rec:{type:'coin',karat:24,grams:2,paid:13000,purchaseDate:'2026-02-02'}}];window.DHB_WALLET_RENDER();});
 await p.waitForTimeout(150);
 const dl2=p.waitForEvent('download',{timeout:5000});
 await p.locator('#walExport').click();
 const d2=await dl2;const body2=fs.readFileSync(await d2.path(),'utf8');
 ok(body2.includes('قطعة حساب')&&body2.includes('في الحساب')&&body2.includes('سبيكة جهاز'),'account + device exported together, deduplicated by id');
 // race: swap the cloud array while the blob is being created
 await p.evaluate(()=>{const orig=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.DHB_CLOUD_ITEMS=[];return orig(b);};});
 let raced=false;
 try{const dl3=p.waitForEvent('download',{timeout:1200});await p.locator('#walExport').click();await dl3;}catch(e){raced=true;}
 ok(raced,'identity change mid-export aborts: zero downloads');
 ok((await p.locator('#walMsg').textContent()).includes('ما نزلش أي ملف'),'abort is explained');
 await p.evaluate(()=>{localStorage.removeItem('dhb-wallet-v1');window.DHB_CLOUD_ITEMS=[];window.DHB_WALLET_RENDER();});
 await p.waitForTimeout(150);
 ok(await p.locator('#walExport').isHidden(),'export button hidden when wallet empty');
 await p.close();await c.close();
 console.log(checks+' wallet export functional assertions passed.');
}catch(e){console.error('FAIL',e.message.slice(0,400));process.exitCode=1}
finally{await b.close();server.close();}
})();
