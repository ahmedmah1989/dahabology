const test=require('node:test'),assert=require('node:assert/strict'),H=require('../public/js/assistant-help.js'),Q=require('../public/js/quote-state.js');
test('Arabic guide routes real program questions, unsafe requests and unknown questions',()=>{
 for(const [q,id] of [['إزاي أضيف قطعة؟','add'],['غرض الاقتناء في الكسر','purpose'],['الفاتورة والضريبة','invoice'],['سبب توقف المؤشر','gauge'],['المركزي والدولار الضمني','fx'],['سعر الذهب والدولار','prices'],['خصوصية بياناتي','privacy'],['رصيدي كام عندي','privacy'],['احفظ القطعة','safety'],['الزكاة','zakat'],['أشتري دلوقتي؟','advice'],['كلمة المرور','privacy']])assert.equal(H.find(q)?.id,id,q);
 assert.equal(H.find('ازاي','invoice').id,'invoice');assert.equal(H.find('مطعم فراخ'),null);
});
test('price responses use shared dated reference and exclude missing/stale inputs',()=>{
 const now=Date.parse('2026-11-21T12:00:00Z'),sourceTime='2026-11-21T11:00:00Z',sources={cbe:{status:'available',sell:53.8629,quoteDate:'2026-11-19'},misr:{status:'available',sell:999,sourceTime},isagha:{status:'available',sourceTime,'24':{sell:6400},'21':{sell:5600}},gold:{status:'available',sourceTime,sell:4000}};
 let s=H.priceAnswer(sources,Q,now);assert.match(s,/53.86/);assert.match(s,/5,600/);assert.match(s,/مؤرّخ/);assert.doesNotMatch(s,/999/);
 delete sources.cbe;s=H.priceAnswer(sources,Q,now);assert.match(s,/لا بديل تلقائي/);
 sources.isagha.sourceTime='2025-01-01T00:00:00Z';s=H.priceAnswer(sources,Q,now);assert.doesNotMatch(s,/5,600/);assert.match(s,/أقدم من 24 ساعة/);
});
test('guide has safe internal paths, no unsupported autonomous functions',()=>{
 for(const t of H.topics){assert.match(t.path,/^(account-preview|wallet|invoice|calculator|market|analysis|products|guide|assistant)\/$|^market\/#(analysis|live)$/);assert.ok(t.text.length>70);}
 assert.match(H.find('دهبي').text,/الحفظ الجديد يحتاج تسجيل الدخول/);
});
