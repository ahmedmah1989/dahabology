/* Keep complete numeric strings on one line, including decimal fractions and signs.
   Text changes, font loading and responsive layout all trigger a new fit. No truncation. */
(function(){
 'use strict';
 const selector='.x-ring .val,.x-ring .change-amount,#walDiff,.x-donut-read b,.x-gauge-read>b,.x-livecalc b,.hero-price>b,.home-market b,.ticker b';
 let queued=false;
 function fit(){
  queued=false;
  document.querySelectorAll(selector).forEach(el=>{
   if(!el.getClientRects().length)return;
   el.style.fontSize='';
   const css=getComputedStyle(el),base=parseFloat(css.fontSize),p=el.parentElement;
   let max=p.clientWidth;
   const ring=el.closest('.x-ring,.x-donut');
   if(ring){
    // Central 70% chord also leaves room for characters with tall ascenders/descenders.
    max=Math.min(max,ring.clientWidth*.70);
   }else if(el.closest('.hero-price'))max=p.clientWidth-24;
   else max=Math.max(1,max-8);
   const r=el.getBoundingClientRect();
   // scrollWidth sees the entire nowrap string, even if its CSS max-width is smaller.
   const width=Math.max(el.scrollWidth,r.width);
   if(width>max&&base>0)el.style.fontSize=(base*max/width*.97)+'px';
  });
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(fit);}}
 const run=()=>{new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true});schedule();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
 window.addEventListener('resize',schedule);
 if(document.fonts)document.fonts.ready.then(schedule);
 window.DHB_FIT_NUMBERS=schedule;
})();
