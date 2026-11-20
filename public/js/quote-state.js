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
 const minutes=Math.floor(a.age/60000),age=minutes<1?'أقل من دقيقة':minutes<60?minutes+' دقيقة':Math.floor(minutes/60)+' ساعة و'+minutes%60+' دقيقة';
 return (a.fresh?'تسعيرة حديثة':'آخر تسعيرة منشورة • متأخرة؛ تحقق قبل الاعتماد عليها')+' • وقت التسعيرة: '+when(a.time)+' القاهرة • العمر: '+age;
}
function connection(t){
 if(!t)return 'لم يُتحقق من الاتصال بعد.';
 const stamp=t.lastOnline?' • آخر فحص ناجح أونلاين: '+when(t.lastOnline)+' القاهرة':'';
 if(t.mode==='network')return 'تم فحص ملف الأسعار أونلاين'+stamp;
 if(t.mode==='cache')return (t.offline?'غير متصل؛ نعرض بيانات محفوظة':'تعذر جلب أحدث ملف؛ نعرض بيانات محفوظة')+stamp;
 return (t.offline?'غير متصل؛ تعذر فحص الأسعار':'تعذر التحقق من أحدث الأسعار')+stamp;
}
const api={assess,when,describe,connection};
if(typeof module!=='undefined')module.exports=api;
if(typeof window!=='undefined')window.DHB_QUOTE=api;
})();
