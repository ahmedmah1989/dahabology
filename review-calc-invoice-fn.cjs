/* Functional closure for the calculator + invoice-check tabs: real inputs -> calculations
   -> cross-tab quote effects, with a synthetic but schema-correct quote event. */
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++};
const root=path.join(__dirname,'dist');
const serve=async dir=>{const s=http.createServer((req,res)=>{let f=path.join(dir,decodeURIComponent(req.url.split('?')[0]));if(f.endsWith('/')||(fs.existsSync(f)&&fs.statSync(f).isDirectory()))f=path.join(f,'index.html');if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f))});await new Promise(r=>s.listen(0,'127.0.0.1',r));return s};
const FIRE=(age)=>{const t=new Date(Date.now()-age).toISOString();window.dispatchEvent(new CustomEvent('gold-board-updated',{detail:{sources:{isagha:{status:'available',sourceTime:t,'21':{sell:5950,buy:5900},'24':{sell:6800,buy:6740}}}}}))};
let server;
(async()=>{server=await serve(root);const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
 const c=await b.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await c.route('https://**/*',r=>r.abort());
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:'+server.address().port+'/calculator/',{waitUntil:'load'});
 await p.waitForSelector('#cResult');
 await p.waitForFunction(()=>document.getElementById('cQuoteStatus').textContent.length>0); // calc.js initialized and rendered
 const val=id=>p.locator('#'+id).inputValue();
 const txt=id=>p.locator('#'+id).textContent();
 /* A: no quote yet -> honest waiting state, no invented price */
 ok(await val('cPrice')==='','no price before quote');
 ok((await txt('cPriceNote')).includes('في انتظار السعر'),'waiting note before quote');
 ok((await txt('cResult')).trim()==='—','placeholder result before quote');
 /* B: live quote arrives -> price fills, note honest */
 await p.evaluate(FIRE,0);
 ok(await val('cPrice')==='5950','21k sell price auto-fills');
 ok((await txt('cPriceNote')).includes('الحساب بسعر الجرام المعروض'),'live-price note');
 /* C: buy by money */
 await p.fill('#cAmount','100000');
 ok((await txt('cResultLabel')).trim()==='تشتري تقريبًا','money-mode result label');
 ok((await txt('cResult')).includes('16.806'),'grams for 100000 at 5950');
 const br=await txt('cBreak');
 ok(br.includes('قيمة الذهب نفسه')&&br.includes('الإجمالي')&&br.includes('تكلفة الجرام النهائية'),'breakdown lines complete');
 ok(br.includes('100,000'),'total matches input amount');
 /* D: mobile live-result mirror stays in sync */
 ok(await p.locator('#cLive').isVisible(),'mobile live mirror visible');
 ok(!(await p.locator('#cLive').evaluate(e=>e.classList.contains('empty'))),'mirror not empty');
 ok((await txt('cLiveVal'))===(await txt('cResult')),'mirror value matches ring result');
 /* E: switch to by-weight */
 await p.click('[data-set="cBy"][data-value="grams"]');
 ok(await val('cAmount')==='','switching method clears amount');
 ok((await txt('cAmountLabel')).includes('الوزن بالجرام'),'amount label switches to weight');
 await p.fill('#cAmount','10');
 ok((await txt('cResult')).includes('59,500'),'cost of 10g at 5950');
 /* F: fees stack per gram; tax on making only */
 await p.click('#calculator details.x-more summary');
 await p.fill('#cMaking','200');await p.fill('#cVat','14');await p.fill('#cStamp','50');
 const br2=await txt('cBreak');
 ok(br2.includes('6,228'),'per-gram 5950+200+50+28 = 6228');
 ok(br2.includes('ضريبة على المصنعية'),'tax line present');
 ok(br2.includes('دمغة ورسوم أخرى'),'stamp line present');
 ok(br2.includes('رسوم فوق قيمة الذهب'),'extra-fees line present');
 ok(br2.includes('سعر شراء التاجر اللازم لتغطية التكلفة'),'break-even resale line present');
 ok((await txt('cResult')).includes('62,280'),'total with fees 62,280');
 /* G: sell mode */
 await p.click('[data-mode="sell"]');
 ok(await val('cAmount')==='','mode switch clears amount');
 ok(await val('cPrice')==='5900','sell mode fills dealer buy price');
 ok(!(await p.locator('.buy-only').first().isVisible()),'buy-only controls hidden in sell');
 ok((await txt('cPriceLabel')).includes('سعر شراء التاجر'),'sell price label');
 await p.fill('#cAmount','10');
 ok((await txt('cResult')).includes('59,000'),'sell 10g at buy 5900');
 ok((await txt('cResultLabel')).includes('تستلم تقريبًا'),'sell result label');
 /* H: manual price marks itself; karat change restores live price */
 await p.fill('#cPrice','6000');
 ok((await txt('cQuoteStatus')).includes('سعر أدخلته بنفسك'),'manual-price status honest');
 ok((await txt('cPriceNote')).includes('الحساب بالسعر الذي أدخلته'),'manual-price note');
 await p.click('[data-set="cKarat"][data-value="18"]');
 ok(await val('cPrice')==='5055','18k sell-mode buy price = 6740*0.75');
 ok((await txt('cPriceNote')).includes('محسوب من عيار 24'),'18k derived note');
 ok(!(await txt('cQuoteStatus')).includes('أدخلته'),'karat change clears manual flag');
 /* I: Arabic-Indic digits parse */
 await p.click('[data-set="cKarat"][data-value="21"]');await p.click('[data-mode="buy"]');
 await p.fill('#cAmount','١٠');
 ok((await txt('cResult')).includes('62,280'),'Arabic-Indic digits parse (10g buy with fees 62,280)');
 /* J: invalid (negative) fee -> no result, honest explanation */
 await p.fill('#cMaking','-5');
 ok((await txt('cResult')).trim()==='—','negative fee yields no result');
 ok((await txt('cExplain')).includes('الرسوم الاختيارية'),'invalid-fee explanation shown');
 await p.fill('#cMaking','');
 ok((await txt('cResult')).includes('60,000'),'clearing fee restores result (stamp only: 10g x 6000)');
 /* K: reset restores defaults and focus */
 await p.click('#cReset');
 ok(await val('cKarat')==='21'&&await val('cBy')==='money','reset restores karat and method');
 ok(await val('cAmount')===''&&await val('cMaking')==='','reset clears inputs');
 ok(await val('cPrice')==='5950','reset refills live price');
 ok(await p.evaluate(()=>document.activeElement.id)==='cAmount','reset focuses amount');
 /* L: stale quote (25h) -> no auto price, honest status */
 await p.evaluate(FIRE,25*3600*1000);
 ok(await val('cPrice')==='','stale quote does not auto-fill price');
 ok((await txt('cQuoteStatus')).includes('24 ساعة'),'stale-quote status honest');
 /* M: invoice tab; the quote seen by the calculator replays into the lazy invoice module */
 await p.evaluate(FIRE,0);
 await p.click('#tab-invoice');
 await p.waitForSelector('#invVerdict');
 await p.waitForFunction(()=>document.getElementById('invPrice').value==='5950');
 ok(true,'invoice tab reuses the live quote without waiting for a new cycle (cross-screen effect)');
 /* N: invoice breakdown */
 await p.fill('#invGrams','8');await p.fill('#invTotal','49424');
 await p.click('#invoice details.x-more summary');
 await p.fill('#invVat','14');
 ok((await txt('invVerdict')).includes('فوق قيمة الذهب'),'verdict states extra over gold');
 ok((await txt('invGold')).includes('47,600'),'gold value 47,600');
 ok((await txt('invExtra')).includes('1,824'),'extra 1,824');
 ok((await txt('invMaking')).includes('200'),'making/gram 200');
 ok((await txt('invTax')).includes('28'),'tax/gram 28');
 ok((await txt('invResale')).includes('47,200'),'resale at dealer buy 47,200');
 ok((await txt('invLoss')).includes('نقص')&&(await txt('invLoss')).includes('2,224'),'resale loss 2,224');
 ok((await txt('invDonutPct')).includes('3.7'),'donut shows extra percent');
 /* O: total below gold value -> warning, no invented making */
 await p.fill('#invTotal','47000');
 ok((await txt('invVerdict')).includes('أقل من قيمة الذهب'),'below-gold warning');
 ok((await txt('invMaking')).trim()==='—','no making split below gold');
 /* P: manual day-of-purchase price; karat change restores live */
 await p.fill('#invPrice','6000');
 ok((await txt('invQuoteStatus')).includes('سعر أدخلته بنفسك'),'invoice manual-price status');
 await p.click('[data-set="invKarat"][data-value="24"]');
 ok(await val('invPrice')==='6800','karat switch restores live 24k price');
 /* Q: invoice reset */
 await p.click('#invReset');
 ok(await val('invGrams')===''&&await val('invTotal')==='','invoice reset clears inputs');
 ok((await txt('invVerdict')).includes('اكتب الوزن والمبلغ'),'invoice reset restores placeholder');
 ok(await p.evaluate(()=>document.activeElement.id)==='invGrams','invoice reset focuses grams');
 await c.close();
 /* R: desktop spot checks */
 const c2=await b.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
 await c2.route('https://**/*',r=>r.abort());
 const d=await c2.newPage();
 await d.goto('http://127.0.0.1:'+server.address().port+'/calculator/',{waitUntil:'load'});
 await d.waitForSelector('#cResult');
 await d.waitForFunction(()=>document.getElementById('cQuoteStatus').textContent.length>0);
 await d.evaluate(FIRE,0);
 await d.fill('#cAmount','100000');
 ok((await d.locator('#cResult').textContent()).includes('16.806'),'desktop calculation matches mobile');
 ok(!(await d.locator('#cLive').isVisible()),'live mirror hidden on desktop');
 await c2.close();
 console.log(checks+' calc/invoice functional closure assertions passed.');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
