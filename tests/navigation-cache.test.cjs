const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('refresh bypasses cached HTML and keeps one offline page across URL variants',async()=>{
 const handlers={},saved=new Map(),requests=[];
 let offline=false;
 const cache={put:async(k,v)=>saved.set(String(k),v)};
 vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{
  self:{addEventListener:(k,f)=>handlers[k]=f},location:{origin:'https://example.test'},URL,Request,Response,Date,
  caches:{open:async()=>cache,match:async k=>saved.get(String(k))},
  fetch:async req=>{requests.push(req);if(offline)throw Error('offline');return new Response('latest story');}
 });
 async function navigate(url){let result;handlers.fetch({request:{method:'GET',mode:'navigate',url},respondWith:r=>result=r});return await result;}
 const first=await navigate('https://example.test/dahabology/?v=old');
 assert.equal(await first.text(),'latest story');
 assert.equal(requests[0].cache,'no-store');
 assert.ok(new URL(requests[0].url).searchParams.has('_dhb_page'));
 assert.equal(saved.size,1);
 offline=true;
 const fallback=await navigate('https://example.test/dahabology/');
 assert.equal(await fallback.text(),'latest story');
});
