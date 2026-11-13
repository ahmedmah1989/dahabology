const test=require('node:test');
const assert=require('node:assert/strict');
const {metrics,lowest}=require('../public/js/comparison.js');
const {quote}=require('../public/js/calc.js');
const {inspect,prices}=require('../public/js/tools.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('comparison normalizes purity and keeps incomplete totals out of ranking',()=>{
 const coin={weight:8,karat:21,total:49000,buyback:47000,final:true};
 const bar={weight:10,karat:24,total:69000,final:true};
 const m=metrics(coin);near(m.pure,7);near(m.perPureGram,7000);near(m.loss,2000);
 assert.deepEqual(lowest([coin,bar]),[1]);
 assert.deepEqual(lowest([coin,{...bar,final:false}]),[]);
 assert.equal(metrics({...coin,final:false}).loss,null);
 assert.equal(metrics({...coin,karat:22}),null);
 assert.equal(metrics({...coin,weight:Infinity}),null);
 assert.equal(metrics({...coin,total:Infinity}),null);
 assert.equal(metrics({...coin,weight:Number.MIN_VALUE,total:1e308}),null);
 assert.deepEqual(lowest([coin]),[]);
 assert.deepEqual(lowest([coin,{...coin}]),[0,1]);
 near(metrics({...coin,buyback:50000}).loss,-1000);
});
test('calculations reject nonfinite values and negative fees instead of inventing zero fees',()=>{
 const buy={mode:'buy',by:'grams',price:5000,amount:10};
 for(const value of [Infinity,NaN,-1]){
  assert.equal(quote({...buy,price:value}),null);
  assert.equal(quote({...buy,making:value}),null);
  assert.equal(inspect({sell:5000,grams:10,total:51000,vat:value}),null);
 }
 assert.equal(quote({...buy,mode:'sell',price:1e308}),null);
 assert.equal(prices({'21':{sell:5000,buy:Infinity}},'21'),null);
 assert.equal(inspect({sell:5000,grams:Infinity,total:51000}),null);
 near(quote({...buy,making:100,stamp:10,vat:14}).total,51240);
 near(quote({...buy,making:0,stamp:0,vat:0}).total,50000);
});
