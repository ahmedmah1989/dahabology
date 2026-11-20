/* Makes every sideways-scrolling list visibly scrollable: edge fade, a position ruler and a short hint. */
(function(){
 var SEL='.x-scroller,.tblw,.merchant-table-scroll,[data-hscroll]';
 function max(el){return Math.max(0,el.scrollWidth-el.clientWidth);}
 function build(el){
  if(el.dataset.hsReady)return;el.dataset.hsReady='1';el.classList.add('hs-target');
  var bar=document.createElement('div');bar.className='hs-bar';bar.hidden=true;
  var hint=document.createElement('span');hint.className='hs-hint';hint.textContent='اسحب يمينًا ويسارًا لعرض المزيد';
  var track=document.createElement('span');track.className='hs-track';track.setAttribute('aria-hidden','true');
  var thumb=document.createElement('span');thumb.className='hs-thumb';track.appendChild(thumb);
  bar.append(hint,track);el.insertAdjacentElement('afterend',bar);
  function update(){
   var m=max(el);bar.hidden=m<4;if(m<4){el.classList.remove('hs-more-start','hs-more-end');return;}
   var p=Math.min(1,Math.abs(el.scrollLeft)/m),w=Math.max(18,el.clientWidth/el.scrollWidth*100);
   thumb.style.width=w+'%';thumb.style.insetInlineStart=(p*(100-w))+'%';
   el.classList.toggle('hs-more-start',p>0.02);el.classList.toggle('hs-more-end',p<0.98);
  }
  el.addEventListener('scroll',update,{passive:true});
  if(window.ResizeObserver){var ro=new ResizeObserver(update);ro.observe(el);Array.prototype.forEach.call(el.children,function(c){ro.observe(c);});}
  window.addEventListener('resize',update);
  new MutationObserver(function(){update();}).observe(el,{childList:true,subtree:true});
  update();setTimeout(update,400);
 }
 function scan(root){(root||document).querySelectorAll(SEL).forEach(build);}
 function start(){scan();new MutationObserver(function(){scan();}).observe(document.body,{childList:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
