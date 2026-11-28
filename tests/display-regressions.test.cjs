const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {readingLabels,todayPoint,withToday}=require('../public/js/analytics.js');
const now=Date.parse('2026-11-20T15:33:00Z');
const sources={gold:{status:'available',sell:3539.199951,sourceTime:'2026-11-20T15:32:06Z'},misr:{status:'available',sell:53.87,sourceTime:'2026-11-20T09:20:47Z'}};
const history=[{d:'2026-11-19',usd:3728.86803872,egp:200739.86919392}];
test('daily and current labels preserve their separate dates, prices and actual quote time',()=>{
 const labels=readingLabels(history,sources,now),point=todayPoint(sources,now),series=withToday(history,sources,now);
 assert.equal(labels.point.usd,point.usd);assert.equal(series.at(-1).usd,point.usd);
 assert.equal(labels.point.sourceTime,sources.gold.sourceTime);
 assert.ok(labels.history.includes('19 نوفمبر'));assert.ok(labels.today.includes('20 نوفمبر'));
 assert.equal(labels.base.d,'2026-11-19');assert.equal(labels.point.d,'2026-11-20');
 assert.ok(labels.basis.includes('3,728.87'));assert.ok(labels.basis.includes('3,539.20'));
 assert.ok(labels.state.includes('06'));assert.ok(labels.state.includes('القاهرة'));
 assert.ok(labels.basis.includes('ليس سجل حركة'));
 assert.ok(!/gold-api|currency-api|jsdelivr/i.test(labels.basis));
});
test('stale or missing current quote never gets a current-level label',()=>{
 const labels=readingLabels(history,sources,now+6*60000);
 assert.equal(labels.point,null);assert.ok(labels.today.includes('غير متاحة'));
 assert.ok(!labels.basis.includes('3,539.20'));
 assert.equal(readingLabels(null,null,now).base,null);
 assert.equal(readingLabels(history,null,now).point,null);
});
test('current observation is drawn as a labelled price level, not a fabricated intraday path',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../public/js/analytics.js'),'utf8');
 assert.ok(source.includes("setAttribute('data-series','today-level')"));
 assert.ok(source.includes("setAttribute('x1',Lm)"));assert.ok(source.includes("setAttribute('x2',W-R)"));
 assert.ok(source.includes("setAttribute('vector-effect','non-scaling-stroke')"));
 assert.ok(source.includes("setAttribute('data-series','today-point')"));
 assert.ok(source.includes("setAttribute('data-series','today-label')"));
 assert.ok(!source.includes('var extension='));
});

test('market headline price shows the source time and the 24h freshness gate is unchanged',()=>{
  const src=fs.readFileSync('public/js/market-view.js','utf8');
  assert.match(src,/آخر تحديث للسعر في المصدر: ' \+ when\(a\.sourceTime\)/);
  assert.match(src,/Date\.now\(\) - t <= 86400000/);
});

test('narrow-phone top bar keeps the title to two lines', () => {
  const css = fs.readFileSync(require('node:path').join(__dirname, '..', 'public', 'app.css'), 'utf8');
  assert.match(css, /@media\(max-width:340px\)\{header\.x-top \.dhb-brand-en\{display:none\}/);
});
