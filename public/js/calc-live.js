/* Mobile only: repeats the result right under the inputs so it stays visible while the keyboard is open. */
(function(){
 var src=document.getElementById('cResult'),lbl=document.getElementById('cResultLabel'),box=document.getElementById('cLive'),
  l2=document.getElementById('cLiveLbl'),v2=document.getElementById('cLiveVal');
 if(!src||!box)return;
 function sync(){var v=(src.textContent||'').trim();var ok=v&&v!=='\u2014'&&v!=='-';box.hidden=false;box.classList.toggle('empty',!ok);if(!ok){l2.textContent='\u0627\u0643\u062a\u0628 \u0627\u0644\u0645\u0628\u0644\u063a \u0644\u062a\u0638\u0647\u0631 \u0627\u0644\u0646\u062a\u064a\u062c\u0629 \u0647\u0646\u0627';v2.textContent='';return;}l2.textContent=(lbl&&lbl.textContent||'').trim()+':';v2.textContent=v;}
 new MutationObserver(sync).observe(src.parentNode,{childList:true,characterData:true,subtree:true});sync();
})();
