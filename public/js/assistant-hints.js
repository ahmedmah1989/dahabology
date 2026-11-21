/* Two brief discovery hints per page visit, no storage, account or network use. */
(function(){
'use strict';
const hint=document.getElementById('helpHint'),launcher=document.getElementById('helpLauncher'),dialog=document.getElementById('helpDialog');if(!hint||!launcher||!dialog)return;
const home=!!launcher.closest('.dhb-help-home');
const target=document.querySelector(home?'header.top .dhb-electric-motto':'header.x-top .dhb-brand-type');
let stopped=false,stage=0,timer=null,hideTimer=null,remaining=1200,started=0;
function hide(){hint.hidden=true;if(target)target.style.visibility='';clearTimeout(hideTimer);}
function stop(){stopped=true;clearTimeout(timer);hide();}
const editing=()=>/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')||document.activeElement?.isContentEditable;
function schedule(){if(stopped||document.hidden||stage>=2)return;started=performance.now();timer=setTimeout(fire,remaining);}
function fire(){
 timer=null;if(stopped||document.hidden)return;
 // Do not interrupt forms, an open menu, or a different modal.
 if(target&&!editing()&&!document.querySelector('.x-dock details[open],dialog[open]')){
  const r=target.getBoundingClientRect();
  if(r.top>=0&&r.bottom<=innerHeight&&r.width>=85&&r.height>=32){
   document.getElementById('helpHintOpen').textContent=home?(stage===0?'أنا توت، مساعدك الذكي. اسألني':'محتاج مساعدة؟ أنا توت'):'أنا مساعدك الذكي';
   Object.assign(hint.style,{top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px'});
   hint.classList.toggle('help-hint-compact',!home);target.style.visibility='hidden';hint.hidden=false;const actual=hint.getBoundingClientRect();hint.style.left=(r.left+r.left-actual.left)+'px';hint.style.top=(r.top+r.top-actual.top)+'px';hideTimer=setTimeout(hide,6500);
  }
 }
 stage++;remaining=178800;if(stage<2)schedule();
}
launcher.addEventListener('click',stop);document.querySelectorAll('[data-open-help]').forEach(b=>b.addEventListener('click',stop));
document.getElementById('helpHintOpen').addEventListener('click',()=>{stop();launcher.click();});document.getElementById('helpHintDismiss').addEventListener('click',()=>{stop();launcher.focus({preventScroll:true});});
document.addEventListener('focusin',e=>{if(e.target.closest?.('input,textarea,select,[contenteditable=true]'))hide();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!hint.hidden){stop();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(timer){remaining=Math.max(0,remaining-(performance.now()-started));clearTimeout(timer);timer=null;}hide();}else schedule();});
new MutationObserver(()=>{if(dialog.open)stop();}).observe(dialog,{attributes:true,attributeFilter:['open']});
const suppressWhenOpen=new MutationObserver(()=>{if(document.querySelector('.x-dock details[open],dialog[open]'))hide();});
suppressWhenOpen.observe(document.body,{attributes:true,attributeFilter:['open'],childList:true,subtree:true});
addEventListener('scroll',hide,{passive:true});addEventListener('resize',hide);addEventListener('pagehide',stop);schedule();
})();
