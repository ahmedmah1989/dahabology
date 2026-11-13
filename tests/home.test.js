const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the home lifecycle without relying on a browser's back/forward cache.
test('returning home keeps one motion timer and remembers the pause preference', () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/pages/index.astro'), 'utf8');
  const script = source.match(/<script is:inline>\s*([\s\S]*?)<\/script>/)[1];
  const intervals = new Set(), events = {}, elements = new Map(), preferences = new Map();
  let nextTimer = 0;
  function element() {
    const classes = new Set(), handlers = {};
    const node = { handlers, children: [], attributes: {}, style: { setProperty() {} }, hidden: false,
      classList: { add: v => classes.add(v), remove: v => classes.delete(v), toggle(v,on) { if(on) classes.add(v); else classes.delete(v); }, contains: v => classes.has(v) },
      setAttribute(k,v) { this.attributes[k] = v; }, appendChild(n) { this.children.push(n); }, blur() {},
      addEventListener(k,f) { handlers[k] = f; }, querySelector() { return element(); } };
    return node;
  }
  const links = Array.from({length:8}, element);
  const get = id => { if (!elements.has(id)) elements.set(id,element()); return elements.get(id); };
  get('stage').querySelectorAll = () => links;
  const document = { hidden:false, body:element(), getElementById:get, createElementNS:element,
    addEventListener(k,f) { events[k] = f; } };
  const context = { document, window:{DHB_BASE:'/',DHB_DATA:'/data/'},
    matchMedia:()=>({matches:false}), location:{},
    localStorage:{getItem:k=>preferences.get(k),setItem:(k,v)=>preferences.set(k,v)},
    sessionStorage:{getItem:()=> '1',setItem(){}},
    addEventListener:(k,f)=>{events[k]=f;},
    setInterval:()=>{const id=++nextTimer;intervals.add(id);return id;}, clearInterval:id=>intervals.delete(id),
    setTimeout:()=>++nextTimer,clearTimeout(){},fetch:()=>new Promise(()=>{}) };
  vm.runInNewContext(script,context);
  assert.equal(intervals.size,1);
  for(let i=0;i<3;i++){
    events.pagehide(); assert.equal(intervals.size,0);
    events.pageshow({persisted:true}); assert.equal(intervals.size,1);
    assert.equal(document.body.classList.contains('play'),false);
  }
  document.hidden=true;events.visibilitychange();assert.equal(intervals.size,0);
  document.hidden=false;events.visibilitychange();assert.equal(intervals.size,1);
  get('motionToggle').handlers.click();
  assert.equal(intervals.size,0);assert.equal(preferences.get('dhb-motion'),'paused');
  events.pagehide();events.pageshow({persisted:true});assert.equal(intervals.size,0);
  assert.equal(get('motionToggle').attributes['aria-pressed'],'true');
  get('motionToggle').handlers.click();assert.equal(intervals.size,1);
  assert.equal(links.length,8);
});
