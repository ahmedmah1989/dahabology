/* Original quote age and observed transport state; never inferred from price changes. */
(function(){
'use strict';
const MAX=86400000,FRESH=300000;
function assess(q,now=Date.now()){
 const t=typeof q?.sourceTime==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(q.sourceTime)?Date.parse(q.sourceTime):NaN;
 const age=now-t,usable=q?.status==='available'&&Number.isFinite(t)&&age>=-120000&&age<=MAX;
 return {usable,fresh:usable&&age<=FRESH,age:Math.max(0,age),time:q?.sourceTime};
}
function when(v){return Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'غير معروف';}
function describe(q,now=Date.now()){
 const a=assess(q,now);if(!a.usable)return 'التسعيرة غير متاحة أو تجاوزت 24 ساعة؛ لا يوجد تسعير تلقائي.';
 return '';
}
function connection(t){
 if(!t)return 'لم يُتحقق من الاتصال بعد.';
 const stamp=t.lastOnline?' • آخر فحص ناجح أونلاين: '+when(t.lastOnline)+' القاهرة':'';
 if(t.mode==='network')return '';
 if(t.mode==='cache')return (t.offline?'غير متصل؛ نعرض بيانات محفوظة':'تعذر جلب أحدث ملف؛ نعرض بيانات محفوظة')+stamp;
 return (t.offline?'غير متصل؛ تعذر فحص الأسعار':'تعذر التحقق من أحدث الأسعار')+stamp;
}
// Last published figure of a quote that is too old to use. Display only: callers must not feed it into any calculation.
function lastPublished(q,label,unit,now=Date.now()){
 const t=typeof q?.sourceTime==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(q.sourceTime)?Date.parse(q.sourceTime):NaN;
 const v=Number(q?.sell);
 if(q?.status!=='available'||!Number.isFinite(t)||!(v>0)||assess(q,now).usable||t>now+120000)return '';
 const d=new Date(t).toLocaleString('ar-EG-u-nu-latn',{timeZone:'Africa/Cairo',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
 return 'آخر سعر منشور ('+label+'): '+v.toLocaleString('en-US',{maximumFractionDigits:2})+' '+unit+'، '+d+' بتوقيت القاهرة. أقدم من 24 ساعة، فمش داخل في أي حساب.';
}
// Official daily reference (date only, no time of day). Display only: it never passes the 24-hour usability gate and feeds no calculation.
function official(q,now=Date.now()){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(q?.quoteDate||'');const v=Number(q?.sell);
 if(q?.status!=='available'||!m||!(v>0))return null;
 const t=Date.UTC(+m[1],+m[2]-1,+m[3],12);
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).split('-').map(Number);
 const today=Date.UTC(parts[0],parts[1]-1,parts[2],12),days=Math.round((today-t)/86400000);
 // Never a future date. Too old (more than 10 days, enough for a long holiday) is not shown as the current official rate.
 if(!Number.isFinite(t)||new Date(t).getUTCMonth()!==+m[2]-1||days<0||days>10)return null;
 const d=new Date(t).toLocaleDateString('ar-EG-u-nu-latn',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'});
 return {value:v.toLocaleString('en-US',{maximumFractionDigits:2}),label:'الدولار بالمركزي',text:'متوسط سوق، سعر البيع، '+d};
}
const api={assess,when,describe,connection,lastPublished,official};
if(typeof module!=='undefined')module.exports=api;
if(typeof window!=='undefined')window.DHB_QUOTE=api;
})();
