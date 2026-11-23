(function(){
'use strict';
const H=window.DHB_HELP,Q=window.DHB_QUOTE,dialog=document.getElementById('helpDialog');if(!dialog||!H)return;
const launcher=document.getElementById('helpLauncher'),input=document.getElementById('helpQuestion'),log=document.getElementById('helpLog');
let previous=null,busy=false,revision=0,controller=null;
const paths=new Set(['','account-preview/','wallet/','invoice/','calculator/','market/','market/#analysis','products/','guide/','assistant/']);
function viewport(){const v=window.visualViewport;dialog.style.setProperty('--help-vh',(v?.height||innerHeight)+'px');dialog.style.setProperty('--help-top',(v?.offsetTop||0)+'px');}
function add(speaker,text,topic){
 const row=document.createElement('div');row.className='help-message';row.dataset.speaker=speaker;
 const label=document.createElement('strong');label.textContent=speaker==='user'?'أنت':'توت · دليل البرنامج';row.append(label);
 const p=document.createElement('p');p.textContent=text;row.append(p);
 if(topic&&paths.has(topic.path)){const a=document.createElement('a');a.href=(window.DHB_BASE||'/')+topic.path;a.textContent='افتح '+(topic.title||'السوق')+' ←';row.append(a);}
 log.append(row);while(log.children.length>30)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;
}
function welcome(){add('assistant','أهلاً بيك! أقدر أشرح أقسام دهبولوجي وخطواته، وأعرض الأسعار العامة بتاريخها. اسأل مثلاً: إزاي أضيف قطعة؟ أو ليه المؤشر متوقف؟\nأنا دليل متخصص بقواعد محلية، مش محادثة ذكاء اصطناعي عامة.');}
function open(){if(dialog.open)return;viewport();dialog.showModal();launcher.setAttribute('aria-expanded','true');input.focus({preventScroll:true});}
function close(){if(dialog.open)dialog.close();}
dialog.addEventListener('close',()=>{launcher.setAttribute('aria-expanded','false');launcher.focus({preventScroll:true});});
launcher.addEventListener('click',open);document.getElementById('helpClose').addEventListener('click',close);
dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
document.querySelectorAll('[data-open-help]').forEach(b=>b.addEventListener('click',open));
async function ask(text){
 text=text.trim();if(!text||busy)return;input.value='';add('user',text);const topic=H.find(text,previous);if(topic)previous=topic.id;
 if(topic?.id==='prices'){
  busy=true;const turn=revision;controller=new AbortController();const requestController=controller;const timer=setTimeout(()=>requestController.abort(),10000);
  try{const response=await fetch((window.DHB_DATA||'data/')+'quotes.json',{cache:'no-store',signal:requestController.signal});if(!response.ok)throw Error('unavailable');const body=await response.json();if(body.schemaVersion!==1||!body.sources||!Q)throw Error('invalid');
   if(turn!==revision)return;const mode=response.headers.get('X-DHB-Transport')||(navigator.serviceWorker?.controller?'unverified':'network');
   const transport=mode==='network'&&navigator.onLine!==false?'وصل ملف الأسعار الآن؛ ده لا يجعل تسعيرة المصدر لحظية.':'قد تكون النسخة محفوظة أو لم يُتحقق من اتصالها؛ راجع السوق قبل الاعتماد عليها.';
   add('assistant',transport+'\n'+H.priceAnswer(body.sources,Q,Date.now()),topic);
  }catch{if(turn===revision)add('assistant','تعذر التحقق من ملف الأسعار الآن. لن أخمّن سعرًا أو أستعمل سعرًا من ذاكرة المحادثة. افتح السوق لمراجعة الاتصال وآخر بيانات متاحة.',topic);}
  finally{clearTimeout(timer);if(turn===revision){busy=false;controller=null;}}
 }else if(topic)add('assistant',topic.text,topic);
 else add('assistant','السؤال ده خارج الدليل اللي أعرفه، ومش هأخمن إجابة. جرّب تسأل عن إضافة قطعة، غرض الاقتناء، الحساب، الفاتورة، الحاسبة، المركزي أو المؤشر. لا أنفّذ معاملات ولا أقرأ ممتلكاتك.',{title:'الدليل',path:'guide/'});
 input.focus({preventScroll:true});
}
document.getElementById('helpForm').addEventListener('submit',e=>{e.preventDefault();if(busy){add('assistant','جارٍ التحقق من ملف الأسعار العام. انتظر النتيجة أو امسح المحادثة لإلغاء الطلب.');return;}ask(input.value);});
document.querySelectorAll('[data-help]').forEach(b=>b.addEventListener('click',()=>ask(b.dataset.help)));
document.getElementById('helpClear').addEventListener('click',()=>{revision++;controller?.abort();busy=false;log.replaceChildren();previous=null;input.value='';welcome();input.focus({preventScroll:true});});
window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
window.addEventListener('pagehide',()=>{revision++;controller?.abort();busy=false;log.replaceChildren();previous=null;input.value='';close();});
window.addEventListener('pageshow',()=>{if(!log.children.length)welcome();});
welcome();viewport();
})();
