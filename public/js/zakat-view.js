/* Zakat result view: Arabic wording and sources for the Elewa-method engine (zakat.js). Display only, no rules here. */
(function (root) {
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var SRC=[['باسم عليوة','بودكاست بترولي (باحث 474403): الوعاء المجمّع، 2.5% من كل الوعاء، يوم زكاة هجري ثابت، عدم التتبع خلال السنة','https://baheth.ieasybooks.com/media/474403?cue=24571431'],
  ['باسم عليوة','لينكدإن 2024-09-22: النصاب 85 جم عيار 24، الحول الهجري','https://ae.linkedin.com/posts/basemelewa_%D9%87%D9%84-%D9%83%D9%84-%D8%A7%D9%84%D8%A3%D9%85%D9%88%D8%A7%D9%84-%D8%B9%D9%84%D9%8A%D9%87%D8%A7-%D8%B2%D9%83%D8%A7%D8%A9-activity-7243684554346033152-mPpR'],
  ['باسم عليوة','لينكدإن 2026-08-23: نية الشراء في المصوغات؛ السبائك والجنيهات والكسر تُزكّى دائماً','https://ae.linkedin.com/posts/basemelewa_%D8%A8%D8%A7%D8%B3%D9%85%D8%B9%D9%84%D9%8A%D9%88%D8%A9-%D8%B4%D8%B1%D9%8A%D8%B9%D8%A9%D8%A3%D9%88%D8%AF%D9%8A%D8%AA-%D8%A7%D9%84%D8%B2%D9%83%D8%A7%D8%A9-activity-7497200216568397826-4RQw'],
  ['باسم عليوة','لينكدإن 2025-01-02 و2024-09-01: العبرة بالموجود في تاريخ الحول سواء زاد أو نقص، والزكاة على إجمالي المال المتجمع ولا ينتظر حول لكل مبلغ','https://ae.linkedin.com/posts/basemelewa_%D8%A7%D8%B6%D8%A7%D9%81%D8%A9-%D8%A5%D8%B6%D8%A7%D9%81%D8%A9-%D8%A8%D8%A7%D8%B3%D9%85%D8%B9%D9%84%D9%8A%D9%88%D8%A9-activity-7280644023168454656-6D-X'],
  ['ندوة قضايا الزكاة المعاصرة (ليست من عليوة)','شروط إعفاء حلي الزينة، والحلي المكسور تجب زكاته بحول جديد','https://shamela.ws/new.php/book/384/7703'],
  ['دار الإفتاء المصرية (ليست من عليوة)','فتوى 20631: العبرة بالنية، وتغيير النية إلى الادخار يبدأ الحول من تاريخه','https://www.dar-alifta.org/ar/Fatwa/Details/20631/']];
  
  var AR=[[/^First hawl/, 'الحول الأول: يعلّم عليوة أن العدّ يبدأ من بلوغ النصاب ثم تؤخذ الزكاة على ما يوجد يوم الزكاة، ولم نجد عنده ما يقال إن نزل المجموع عن النصاب خلال هذا الحول الأول. فلا نقرر وجوباً إلا إذا أكدتَ بقاءه فوق النصاب.'],
  [/^Earlier years/, 'السنوات السابقة: أجب هل كانت عليك زكاة في سنة سابقة (وأنها دُفعت)، أو أن هذه أول مرة. هذه معلومة عنك وليست حكماً، ولا نعطي رقماً قبلها.'],
  [/not the first/,'هذه ليست أول مرة بعد بلوغ النصاب. لا نعالج سنوات سابقة لم تُخرج زكاتها، فأكّد أنها مسدّدة.'],[/^Personal Hijri zakat date/,'يوم الزكاة الهجري ناقص: اكتب الشهر (1 إلى 12) واليوم (1 إلى 30).'],
  [/^Gold price per gram/,'سعر جرام عيار 24 مطلوب.'],
  [/^Other zakatable assets/,'اكتب صافي النقد والأصول الزكوية الأخرى، واكتب 0 إن لم يوجد.'],
  [/date the total reached nisab is required/,'تاريخ بلوغ المجموع النصاب مطلوب عند وجود نقد أو أصول أخرى.'],
  [/karat, weight or purchase date/,'العيار أو الوزن أو تاريخ الشراء ناقص أو غير صحيح.'],
  [/needs the purpose it was bought for/,'المصوغات: اختر نية الشراء (زينة أو ادخار).'],
  [/adornment jewelry needs answers/,'أجب عن الشروط الأربعة لإعفاء الزينة.'],
  [/must be entered as broken jewelry/,'المصوغات غير الصالحة للبس تُدخل كمصوغات مكسورة.'],
  [/needs the date it broke/,'تاريخ الكسر مطلوب وغير صحيح أو في المستقبل.'],
  [/kept for repair/,'مصوغات مكسورة للإصلاح: مالك (الموطأ 675) يرى أنها كالمتاع فلا زكاة، والندوة ترى زكاتها بحول جديد من الكسر. اختلاف لم نجد ترجيحاً له عند عليوة، فلا نعطي رقماً.'],
  [/change-of-purpose date invalid/,'تاريخ تغيير النية غير صحيح.'],
  [/Hijri day 30/,'اليوم 30 من شهر الزكاة غير موجود في هذه السنة (الشهر 29 يوماً). لم نجد مصدراً يحدد هل يؤخذ اليوم 29 أم 1، فلا نعطي رقماً.'],
  [/within 2 days|sighting/,'نهاية الحول قريبة (يومان أو أقل) من يوم الزكاة، ويلزم التأكد من بداية الشهر بالرؤية. هذا قيد من دهبولوجي وليس حكماً شرعياً.']];
  function ar(b){for(var i=0;i<AR.length;i++)if(AR[i][0].test(b))return AR[i][1];return b}
  var RS={'zakatable wealth is below nisab on the zakat date':'المجموع أقل من النصاب (85 جراماً عيار 24).','no item counts as zakatable under the answers given (adornment exemption)':'لا شيء تجب زكاته وفق الإجابات (إعفاء حلي الزينة).'};
  
  function ar(b) { for (var i = 0; i < AR.length; i++) if (AR[i][0].test(b)) return AR[i][1]; return b; }
  function D(x) { return '<bdi dir="ltr">' + esc(x) + '</bdi>'; }
  // labels: { itemId: 'name' } so a per-item message names the item
  function html(r, labels) {
    labels = labels || {};
    var fix = function (b) { var m = /^([^:]+): /.exec(b); var lab = m && labels[m[1]]; return (lab ? lab + ': ' : '') + ar(m && labels[m[1]] ? b.slice(m[0].length) : b); };
    var h;
    if (r.status === 'blocked') h = '<h2>لا نعطي رقماً الآن</h2><ul>' + r.blockers.map(function (b) { return '<li>' + esc(fix(b)) + '</li>'; }).join('') + '</ul>';
    else if (r.due) h = '<h2>الزكاة مستحقة وفق هذه القواعد</h2><p class="x-note">المبلغ: <b>' + r.amount.toFixed(2) + '</b> ريال، وهو 2.5% من المجموع كله (' + r.base.toFixed(2) + ' ريال).<br>آخر يوم زكاة: ' + D(r.zakatDateOccurrence) + '<br>اكتمل الحول الهجري بتاريخ ' + D(r.hawlCompleteOn) + ' وهو قبل يوم الزكاة، وبلغ النصاب في ' + D(r.nisabReachedOn) + '.</p>';
    else h = '<h2>لا زكاة مستحقة الآن وفق هذه القواعد</h2><p class="x-note">' + esc(RS[r.reason] || (/full Hijri year/.test(r.reason || '') ? 'لم يتم حول هجري كامل من بلوغ النصاب حتى آخر يوم زكاة.' : r.reason) || '') + '</p>';
    if (r.ruleSources) h += '<p class="x-note">ليست فتوى ولم يراجعها عالم. كل قاعدة منسوبة لمصدرها في قسم المصادر، وليست رأياً واحداً لعالم واحد.</p>';
    return h;
  }
  function sourcesHtml() { return SRC.map(function (s) { return '<li><span class="tag">' + esc(s[0]) + '</span>' + esc(s[1]) + ' <a href="' + s[2] + '" rel="noopener">المصدر</a></li>'; }).join(''); }
  root.DHB_ZAKAT_VIEW = { html: html, sourcesHtml: sourcesHtml, ar: ar };
})(typeof window !== 'undefined' ? window : globalThis);
