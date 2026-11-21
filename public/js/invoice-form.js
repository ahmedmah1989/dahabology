/* Purchase entry form: one invoice (date, optional tax) with one or more lines. Draws into #invForm and keeps its own state.
 * It never saves anything: wallet-account.js reads collect() and decides. Every typed value is read strictly by the ledger model. */
(function () {
  if (typeof document === 'undefined') return;
  const LG = window.DHB_LEDGER, $ = id => document.getElementById(id);
  // Sizes: live catalog when readable, else the dated bundled snapshot (labelled as such).
  let sizes = { bars: LG.CATALOG_SNAPSHOT.bars, coins: LG.CATALOG_SNAPSHOT.coins, live: false };
  const sizeNote = () => sizes.live ? '' : '<p class="hint">الأحجام من قائمة محفوظة بتاريخ ' + LG.CATALOG_SNAPSHOT.asOf + ' لأن كتالوج المنتجات الحالي غير متاح الآن. اكتب الوزن بنفسك لو حجمك مختلف.</p>';
  const chipsHTML = (arr, label) => '<div class="chips" role="group" aria-label="' + label + '">' + arr.map(c => '<button type="button" class="chip" data-w="' + c.w + '" aria-pressed="false">' + c.t + '</button>').join('') + '</div>';
  const root = $('invForm'); if (!root || !LG) return;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fm = n => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const fg = n => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—');
  const cents = p => (p / 100).toFixed(2);
  const money = v => { const r = LG.parseNumber(v, 'money'); return r.value === undefined ? NaN : r.value; };
  const newRow = () => ({ type: '', k: '', gw: '', gf: '', p: '', s: '', mk: '', st: '', mkN: false, stN: false, mso: false, qty: '1', pp: '', basis: '', stoneG: '', promise: false });
  let rows, mode, tax, calc, edit, invMode; // tax: {pre, vat, post}; calc: which of the three is a calculated value
  const reset = () => { rows = [newRow()]; mode = 'unknown'; tax = { pre: '', vat: '', post: '' }; calc = {}; edit = null; invMode = null; $('walDD').value = ''; $('walMM').value = ''; $('walYY').value = ''; $('walNoteIn') && ($('walNoteIn').value = ''); };

  // ---- weight and quantity for one line ----
  const qOf = r => LG.readQty(r.qty);
  const wOf = r => { if (r.keepWeight && r.gw === '' && r.gf === '') return { keep: true }; return LG.composeWeight(r.gw, r.gf); };
  const fin = (r) => {
    const w = wOf(r), q = qOf(r);
    if (w.keep) return 'الوزن المحفوظ: <span dir="ltr">' + esc(r.keepWeight) + '</span> جرام (كما هو)';
    if (w.blank) return '<span class="ph">مثال: جرام 6 والكسر 28 يبقى <span dir="ltr">6.28</span> جرام</span>';
    if (w.error) return w.error === 'zero' ? 'الوزن لازم يكون أكبر من صفر.' : 'اكتب أرقام بس. الكسر لحد ٣ أرقام.';
    if (q.error) return 'العدد لازم يكون رقم من 1 لـ 999.';
    const u = fg(LG.gramsOfMg(w.mg));
    return q.value > 1 ? 'وزن القطعة: <span dir="ltr">' + u + '</span> جرام<br>الوزن الكلي: <span dir="ltr">' + q.value + ' × ' + u + ' = ' + fg(LG.gramsOfMg(LG.totalMg(w.mg, q.value))) + '</span> جرام' : 'الوزن النهائي: <span dir="ltr">' + u + '</span> جرام';
  };
  const feeText = (r, k) => (r[k + 'N'] ? 'بدون' : String(r[k]).trim() === '' ? 'غير مسجلة' : Number.isFinite(money(r[k])) ? fm(money(r[k])) + ' جنيه' : 'راجع الرقم');
  const typeName = { bar: 'سبيكة', coin: 'جنيه', jewelry: 'مصوغات', scrap: 'كسر' };

  function rowHTML(r, i) {
    const bar = r.type === 'bar', jw = r.type === 'jewelry', q = qOf(r), mq = !q.error && q.value > 1, tl = mq ? ' (للـ ' + q.value + ' كلهم)' : '';
    const w = wOf(r), presetOn = v => !w.error && !w.blank && !w.keep && w.mg === Math.round(v * 1000);
    return '<div class="row" data-i="' + i + '"><div class="rh"><span>' + (edit ? 'تعديل القطعة' : 'القطعة ' + (i + 1)) + (mq ? ' · ' + q.value + ' قطع' : '') + '</span>' + (rows.length > 1 && !edit ? '<button type="button" class="del" data-del="' + i + '" aria-label="احذف القطعة ' + (i + 1) + '">احذف</button>' : '') + '</div>' +
      '<div class="g4"><div><span class="lab">النوع</span><select class="in" data-f="type"><option value="">اختر</option>' + Object.keys(typeName).map(v => '<option value="' + v + '"' + (r.type === v ? ' selected' : '') + '>' + typeName[v] + '</option>').join('') + '</select></div>' +
      (bar && !r.legacyKarat ? '<div><span class="lab">العيار</span><div class="in fixk" aria-label="عيار السبيكة ثابت 24">24 (ثابت)</div></div>' : '<div><span class="lab">العيار</span><select class="in" data-f="k"><option value="">اختر</option>' + ['21', '24', '18'].map(v => '<option' + (r.k === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>') +
      ((bar || r.type === 'coin') ? '<div class="wgt"><span class="cl" style="margin-top:0">' + (bar ? 'حجم السبيكة الواحدة (جرام)' : 'حجم الجنيه الذهب') + '، أو اكتب الوزن تحت</span>' + chipsHTML(bar ? sizes.bars.map(v => ({ w: v, t: v })) : sizes.coins.map(c => ({ w: c.w, t: c.name + ' (' + c.w + ')' })), bar ? 'حجم السبيكة بالجرام' : 'حجم الجنيه الذهب') + (r.sizeWarn ? '<p class="hint" role="alert">أحجام الكتالوج دي لعيار ' + r.sizeWarn + '. العيار المختار عندك مختلف، فما اتطبقش حجم. غيّر العيار أو اكتب الوزن بنفسك.</p>' : '') + sizeNote() + '</div>' : '') +
      '<div class="qty"><span class="lab">العدد</span><div class="qs"><button type="button" class="qb" data-q="-1" aria-label="قلّل العدد">−</button><input class="in" data-f="qty" inputmode="numeric" maxlength="3" value="' + esc(r.qty) + '" aria-label="عدد القطع المتطابقة، القطعة ' + (i + 1) + '"><button type="button" class="qb" data-q="1" aria-label="زوّد العدد">+</button></div><p class="hint" style="margin:4px 0 0">' + (mq ? 'نفس النوع والعيار والوزن. اللي بتكتبه تحت للـ ' + q.value + ' كلهم مع بعض.' : 'لو اشتريت أكتر من واحدة بنفس الوزن، زوّد العدد.') + '</p></div>' +
      '<div class="wgt"><span class="lab">' + (mq ? 'وزن القطعة الواحدة' : 'الوزن') + '</span><div class="wg"><div><input class="in" data-f="gw" inputmode="numeric" maxlength="5" placeholder="0" value="' + esc(r.gw) + '" aria-label="الجرامات الصحيحة، قطعة ' + (i + 1) + '"><span class="u">جرام</span></div><b class="dot">.</b><div><input class="in" data-f="gf" inputmode="numeric" maxlength="3" placeholder="0" value="' + esc(r.gf) + '" aria-label="الكسر بعد الفاصلة، قطعة ' + (i + 1) + '"><span class="u">الكسر (بعد الفاصلة)</span></div></div><p class="fin" data-fin>' + fin(r) + '</p>' +
'</div>' +
      '<div class="paidb"><span class="lab">' + (mq ? 'دفعت في الـ ' + q.value + ' كلهم (جنيه)' : 'دفعت فيها (جنيه)') + '</span><input class="in" data-f="p" inputmode="decimal" placeholder="0" value="' + esc(r.p) + '" aria-label="المبلغ المدفوع، قطعة ' + (i + 1) + '"></div></div>' +
      (jw ? '<div class="sg" role="group" aria-label="نية الشراء"><button type="button" data-pp="adornment" aria-pressed="' + (r.pp === 'adornment') + '">زينة</button><button type="button" data-pp="saving" aria-pressed="' + (r.pp === 'saving') + '">ادخار</button></div>' : '') +
      '<div class="ms"><button type="button" class="msb" data-ms aria-expanded="' + !!r.mso + '"><span>المصنعية' + tl + ': <b>' + feeText(r, 'mk') + '</b></span><span>الدمغة' + tl + ': <b>' + feeText(r, 'st') + '</b></span><i>' + (r.mso ? '▲' : '▼') + '</i></button>' +
      (r.mso ? '<div class="msf"><div class="fr"><label class="lab">المصنعية' + tl + ' (جنيه)</label><div><input class="in" data-f="mk" inputmode="decimal" placeholder="غير مسجلة" value="' + esc(r.mk) + '"' + (r.mkN ? ' disabled' : '') + '><button type="button" class="nob" data-none="mk" aria-pressed="' + !!r.mkN + '">بدون مصنعية</button></div></div>' +
        '<div class="fr"><label class="lab">الدمغة' + tl + ' (جنيه)</label><div><input class="in" data-f="st" inputmode="decimal" placeholder="غير مسجلة" value="' + esc(r.st) + '"' + (r.stN ? ' disabled' : '') + '><button type="button" class="nob" data-none="st" aria-pressed="' + !!r.stN + '">بدون دمغة</button></div></div>' +
        '<p class="hint">لو الفاتورة بتقول إنها داخل المبلغ اللي دفعته، فهي جزء منه وما بتتضافش عليه تاني. سيبها فاضية لو مش مكتوبة (غير مسجلة، وده غير «بدون»).</p></div>' : '') + '</div>' +
      '<div class="sg" role="group" aria-label="فصوص"><button type="button" data-s="without" aria-pressed="' + (r.s === 'without') + '">بدون فصوص</button><button type="button" data-s="with" aria-pressed="' + (r.s === 'with') + '">بفصوص</button></div>' +
      (r.s === 'with' ? '<div class="msf"><div class="fr"><label class="lab">وزن الذهب المعتمد للبيع</label><select class="in" data-f="basis"><option value="">غير معروف</option><option value="total"' + (r.basis === 'total' ? ' selected' : '') + '>الوزن الكلي شامل الفصوص</option><option value="net"' + (r.basis === 'net' ? ' selected' : '') + '>الوزن صافي ذهب</option></select></div>' +
        (r.basis === 'total' ? '<div class="fr"><label class="lab">وزن الفصوص بالجرام</label><input class="in" data-f="stoneG" inputmode="decimal" value="' + esc(r.stoneG) + '"></div>' : '') +
        '<label class="gate" style="min-height:44px;font-size:14px"><input type="checkbox" data-f="promise"' + (r.promise ? ' checked' : '') + '> البائع وعد باسترداد الفصوص بسعر الذهب (الوعد مش مضمون)</label></div>' : '') + '</div>';
  }
  const paintRows = () => { $('invRows').innerHTML = rows.map(rowHTML).join(''); };
  fetch((window.DHB_DATA || 'data/') + 'offers.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
    const z = j && LG.sizesFromCatalog(j.catalog);
    if (z) { sizes = { bars: z.bars, coins: z.coins.length ? z.coins : LG.CATALOG_SNAPSHOT.coins, live: true }; paintRows(); }
  }).catch(() => {});
  const paintFin = rowEl => { const r = rows[rowEl.dataset.i]; rowEl.querySelector('[data-fin]').innerHTML = fin(r); const w = wOf(r); rowEl.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(!w.error && !w.blank && !w.keep && w.mg === Math.round(+c.dataset.w * 1000)))); };

  // ---- invoice-level tax: with two figures given, the third is a real calculated value, tagged ----
  function taxFigures() {
    const ids = ['pre', 'vat', 'post'];
    // A calculated figure is never kept across edits: drop it every pass and, if two typed figures remain, derive it again from them.
    ids.forEach(k => { if (calc[k]) { tax[k] = ''; delete calc[k]; } });
    const given = ids.filter(k => !calc[k] && tax[k].trim() !== ''), empty = ids.filter(k => tax[k].trim() === '');
    if (given.length === 2 && empty.length === 1 && given.every(k => Number.isFinite(money(tax[k])))) {
      const f = LG.invoiceFigures('has', money(tax.pre) || undefined, money(tax.vat), money(tax.post) || undefined);
      const a = { pre: Number.isFinite(money(tax.pre)) ? money(tax.pre) : undefined, vat: Number.isFinite(money(tax.vat)) ? money(tax.vat) : undefined, post: Number.isFinite(money(tax.post)) ? money(tax.post) : undefined };
      const g = LG.invoiceFigures('has', a.pre, a.vat, a.post);
      if (g.calc && !g.negative) { const key = { sub: 'pre', vat: 'vat', total: 'post' }[g.calc], v = { sub: g.sub, vat: g.vat, total: g.total }[g.calc]; tax[key] = cents(v); calc[key] = true; }
      void f;
    }
    return { pre: money(tax.pre), vat: money(tax.vat), post: money(tax.post) };
  }
  const P = x => LG.piastres(x);

  function update(keepRev) {
    if (invMode) return updateInvoiceMode(keepRev);
    const q = rows.map(qOf), w = rows.map(wOf);
    const unitsAll = rows.reduce((a, _r, i) => a + (q[i].error ? 1 : q[i].value), 0);
    const gMg = rows.reduce((a, _r, i) => a + (!q[i].error && w[i].mg ? LG.totalMg(w[i].mg, q[i].value) : 0), 0);
    const paids = rows.map(r => money(r.p)), okP = paids.filter(Number.isFinite).reduce((x, y) => x + P(y), 0);
    const figs = mode === 'has' ? taxFigures() : { pre: NaN, vat: NaN, post: NaN };
    let total = figs.post; if (mode === 'has' && !Number.isFinite(total) && Number.isFinite(figs.pre) && Number.isFinite(figs.vat)) total = (P(figs.pre) + P(figs.vat)) / 100;
    if (mode === 'has') ['pre', 'vat', 'post'].forEach(k => { const el = $('t_' + k); if (el && document.activeElement !== el) el.value = tax[k]; el && el.classList.toggle('calc', !!calc[k]); });
    const cn = mode === 'has' && ['pre', 'vat', 'post'].some(k => calc[k]); $('calcNote').innerHTML = cn ? '<span class="tag">محسوب</span> الخانة المحسوبة بخط منقط. اكتب فوقها لو الفاتورة مختلفة.' : '';
    const bad = mode === 'has' && [figs.pre, figs.vat, figs.post].every(Number.isFinite) && P(figs.pre) + P(figs.vat) !== P(figs.post);
    $('taxMsg').innerHTML = bad ? '<span style="color:#f0ca78">قبل الضريبة + الضريبة لازم يساوي بعد الضريبة. راجع الأرقام مع الفاتورة، أو امسح خانة واحدة وهتتحسب لوحدها. ما اتغيّر أي رقم كتبته.</span>' : 'اكتب رقمين والتالت بيتحسب. بنسجّل اللي في فاتورتك فقط.';
    $('taxSum').textContent = { unknown: 'غير معروفة', none: 'بدون ضريبة', has: 'حسب الفاتورة' }[mode];
    $('h14').hidden = mode !== 'has';
    const row = (l, v, u) => '<div class="sr"><span>' + l + '</span><b' + (u ? ' class="u0"' : '') + '>' + v + '</b></div>';
    const agg = k => {
      const rec = rows.filter(r => !r[k + 'N'] && r[k].trim() !== '' && Number.isFinite(money(r[k]))), none = rows.filter(r => r[k + 'N']).length;
      if (rec.length) return { v: fm(rec.reduce((a, r) => a + P(money(r[k])), 0) / 100) + ' جنيه', u: false, n: '(' + (rec.length + none) + ' من ' + rows.length + ' سطور)' };
      return none === rows.length ? { v: 'بدون', u: false, n: '' } : { v: 'غير مسجلة', u: true, n: '' };
    };
    const mk = agg('mk'), st = agg('st');
    let det = '<div class="sh">ملخص الفاتورة</div>';
    if (mode === 'has') det += row('قبل الضريبة', Number.isFinite(figs.pre) ? fm(figs.pre) + ' جنيه' : 'غير مسجل', !Number.isFinite(figs.pre)) + row('الضريبة (الفاتورة كلها)', Number.isFinite(figs.vat) ? fm(figs.vat) + ' جنيه' : 'غير مسجلة', !Number.isFinite(figs.vat)) + row('بعد الضريبة', Number.isFinite(total) ? fm(total) + ' جنيه' : 'غير مسجل', !Number.isFinite(total));
    else det += row('الضريبة', mode === 'none' ? 'بدون ضريبة' : 'غير مسجلة', mode !== 'none');
    det += row('المصنعية (للقطع) ' + mk.n, mk.v, mk.u) + row('الدمغة (للقطع) ' + st.n, st.v, st.u) + '<p class="hint" style="margin:4px 0 0">المصنعية والدمغة المسجلة تفصيل داخل المبلغ المدفوع، مش زيادة عليه.</p>';
    const lines = [];
    if (bad) lines.push('<span class="diff">أرقام الضريبة مش متطابقة، فمفيش مطابقة مع القطع لحد ما تتصحح.</span>');
    else if (Number.isFinite(total)) {
      lines.push('إجمالي الفاتورة ' + fm(total) + ' جنيه');
      const rc = LG.reconcile(total, rows.map((_r, i) => ({ paid: paids[i] })));
      if (rc.state === 'match') lines.push('<span class="ok">مجموع القطع يساوي إجمالي الفاتورة.</span>');
      else if (rc.state === 'diff') lines.push('<span class="diff">الفرق بين إجمالي الفاتورة ومجموع القطع: ' + fm(Math.abs(rc.diff)) + ' جنيه ' + (rc.diff > 0 ? '(الفاتورة أكبر)' : '(القطع أكبر)') + '. الفرق مش بيتقسّم على القطع ولا بيتغيّر فيها.</span>');
    }
    $('sum').innerHTML = '<b><span class="l1">' + unitsAll + ' ' + (unitsAll === 1 ? 'قطعة' : 'قطع') + ' · ' + fg(gMg / 1000) + ' جرام</span><span class="l1">دفعت في القطع ' + fm(okP / 100) + ' جنيه</span></b>' + det + lines.map(l => '<p>' + l + '</p>').join('');
    if (!keepRev) $('walRev').checked = false;
    const ok = rows.every((r, i) => !q[i].error && (w[i].keep || w[i].mg) && ['mk', 'st'].every(k => r[k + 'N'] || r[k].trim() === '' || Number.isFinite(money(r[k]))) && r.type && ['18', '21', '24'].includes(r.k) && Number.isFinite(paids[i]) && r.s && (r.type !== 'jewelry' || r.pp));
    const okAll = ok && !bad; root.dataset.complete = okAll ? '1' : '';
    $('invErr').textContent = bad ? 'أرقام الضريبة مش متطابقة. صحّحها أو امسح خانة واحدة قبل الحفظ.' : (ok ? '' : 'كمّل النوع والعيار والجرام والمبلغ واختيار الفصوص لكل قطعة.');
    $('walAdd').disabled = !(okAll && $('walRev').checked) || root.dataset.busy === '1';
    root.dispatchEvent(new CustomEvent('invform:update'));
  }

  // Invoice-only edit: date and tax figures of a saved invoice. Lines are not shown; their paid amounts are only compared with the total.
  function updateInvoiceMode(keepRev) {
    const figs = mode === 'has' ? taxFigures() : { pre: NaN, vat: NaN, post: NaN };
    let total = figs.post; if (mode === 'has' && !Number.isFinite(total) && Number.isFinite(figs.pre) && Number.isFinite(figs.vat)) total = (P(figs.pre) + P(figs.vat)) / 100;
    if (mode === 'has') ['pre', 'vat', 'post'].forEach(k => { const el = $('t_' + k); if (el && document.activeElement !== el) el.value = tax[k]; el && el.classList.toggle('calc', !!calc[k]); });
    $('calcNote').innerHTML = mode === 'has' && ['pre', 'vat', 'post'].some(k => calc[k]) ? '<span class="tag">محسوب</span> الخانة المحسوبة بخط منقط. اكتب فوقها لو الفاتورة مختلفة.' : '';
    const bad = mode === 'has' && [figs.pre, figs.vat, figs.post].every(Number.isFinite) && P(figs.pre) + P(figs.vat) !== P(figs.post);
    $('taxMsg').innerHTML = bad ? '<span style="color:#f0ca78">قبل الضريبة + الضريبة لازم يساوي بعد الضريبة. راجع الأرقام مع الفاتورة، أو امسح خانة واحدة وهتتحسب لوحدها. ما اتغيّر أي رقم كتبته.</span>' : 'اكتب رقمين والتالت بيتحسب. بنسجّل اللي في فاتورتك فقط.';
    $('taxSum').textContent = { unknown: 'غير معروفة', none: 'بدون ضريبة', has: 'حسب الفاتورة' }[mode]; $('h14').hidden = mode !== 'has';
    const paids = invMode.paids, sumP = paids.every(Number.isFinite) ? paids.reduce((a, x) => a + P(x), 0) / 100 : NaN, lines = [];
    lines.push('قطع الفاتورة: ' + paids.length + (Number.isFinite(sumP) ? ' • مجموع ما دفعته فيها ' + fm(sumP) + ' جنيه' : ''));
    if (bad) lines.push('<span class="diff">أرقام الضريبة مش متطابقة، فمفيش مطابقة مع القطع لحد ما تتصحح.</span>');
    else if (Number.isFinite(total)) { lines.push('إجمالي الفاتورة ' + fm(total) + ' جنيه'); const rc = LG.reconcile(total, paids.map(x => ({ paid: x })));
      if (rc.state === 'match') lines.push('<span class="ok">مجموع القطع يساوي إجمالي الفاتورة.</span>'); else if (rc.state === 'diff') lines.push('<span class="diff">الفرق بين إجمالي الفاتورة ومجموع القطع: ' + fm(Math.abs(rc.diff)) + ' جنيه. الفرق مش بيتقسّم على القطع ولا بيتغيّر فيها.</span>'); }
    $('sum').innerHTML = '<div class="sh">ملخص الفاتورة</div>' + lines.map(l => '<p>' + l + '</p>').join('') + '<p class="hint">التعديل هنا بيغيّر تاريخ الفاتورة وأرقام ضريبتها بس. القطع نفسها بتتعدّل من قائمتها.</p>';
    if (!keepRev) $('walRev').checked = false;
    const ok = !!LG.parseDMY($('walDD').value, $('walMM').value, $('walYY').value) && !bad; root.dataset.complete = ok ? '1' : ''; $('invErr').textContent = bad ? 'أرقام الضريبة مش متطابقة. صحّحها أو امسح خانة واحدة قبل الحفظ.' : (ok ? '' : 'اكتب تاريخ الفاتورة صح.');
    $('walAdd').disabled = !(ok && $('walRev').checked) || root.dataset.busy === '1';
    root.dispatchEvent(new CustomEvent('invform:update'));
  }

  // ---- events ----
  const touch = () => { $('walRev').checked = false; };
  $('invRows').addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return; const rowEl = e.target.closest('.row'), r = rows[rowEl.dataset.i];
    if (f === 'promise') r.promise = e.target.checked; else r[f] = e.target.value;
    if (f === 'qty') { e.target.value = r.qty = r.qty.replace(/\D/g, ''); }
    if (f === 'gw' || f === 'gf') { e.target.value = r[f] = r[f].replace(/\D/g, ''); }
    if (f === 'mk' || f === 'st') { const b = rowEl.querySelector('.msb'); b.querySelectorAll('b')[0].textContent = feeText(r, 'mk'); b.querySelectorAll('b')[1].textContent = feeText(r, 'st'); }
    if (f === 'qty' || f === 'gw' || f === 'gf') paintFin(rowEl);
    touch(); update();
  });
  $('invRows').addEventListener('change', e => {
    const f = e.target.dataset.f; if (!f) return; const r = rows[e.target.closest('.row').dataset.i];
    if (f === 'qty') { paintRows(); touch(); update(); return; }
    if (f === 'type' || f === 'k' || f === 'basis') { const was = r.type; r[f] = e.target.value; if (f === 'type' && !r.legacyKarat) { if (r.type === 'bar') r.k = '24'; else if (was === 'bar') r.k = ''; } if (f === 'type' || f === 'basis') paintRows(); touch(); update(); }
  });
  $('invRows').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const rowEl = b.closest('.row'), r = rows[rowEl.dataset.i];
    if (b.dataset.del !== undefined) rows.splice(+b.dataset.del, 1);
    else if (b.dataset.q) { const q = qOf(r); r.qty = String(Math.min(999, Math.max(1, (q.error ? 1 : q.value) + +b.dataset.q))); }
    else if (b.dataset.ms !== undefined) r.mso = !r.mso;
    else if (b.dataset.none) { const k = b.dataset.none; r[k + 'N'] = !r[k + 'N']; if (r[k + 'N']) r[k] = ''; }
    else if (b.dataset.w) {
      // Catalog sizes are for 24k bars and 21k coins. A different karat already chosen is never overwritten or relabelled: the size is not applied.
      const need = r.type === 'coin' ? '21' : '24';
      if (r.k && r.k !== need) r.sizeWarn = need;
      else { const [a, c] = String(b.dataset.w).split('.'); r.gw = a; r.gf = c || ''; r.sizeWarn = ''; if (!r.k) r.k = need; }
    }
    else if (b.dataset.s) { r.s = b.dataset.s; if (r.s === 'without') { r.basis = ''; r.stoneG = ''; r.promise = false; } }
    else if (b.dataset.pp) r.pp = b.dataset.pp; else return;
    paintRows(); rows.forEach((_r, i) => 0); touch(); update();
  });
  $('invAdd').addEventListener('click', () => { rows.push(newRow()); paintRows(); touch(); update(); });
  $('taxMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; [...$('taxMode').children].forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('taxF').hidden = mode !== 'has'; touch(); update(); });
  ['pre', 'vat', 'post'].forEach(k => $('t_' + k).addEventListener('input', e => { tax[k] = e.target.value; delete calc[k]; e.target.classList.remove('calc'); touch(); update(); }));
  // A field that was focused while its value changed is not rewritten under the cursor; repaint it when the cursor leaves.
  ['pre', 'vat', 'post'].forEach(k => $('t_' + k).addEventListener('blur', () => update(true)));
  $('h14').addEventListener('click', () => { const a = money(tax.pre); if (!Number.isFinite(a)) return; tax.post = ''; delete calc.post; tax.vat = cents(Math.round(P(a) * 14 / 100)); delete calc.vat; touch(); update(); });
  ['walDD', 'walMM', 'walYY'].forEach(i => $(i).addEventListener('input', touch));
  $('walCal').addEventListener('change', e => { const [y, m, d] = e.target.value.split('-'); if (y) { $('walDD').value = +d; $('walMM').value = +m; $('walYY').value = y; touch(); update(); } });
  $('walCal').addEventListener('click', e => { try { e.target.showPicker && e.target.showPicker(); } catch (_) {} });
  $('walRev').addEventListener('change', () => update(true));

  function syncTaxUI() { [...$('taxMode').children].forEach(x => x.setAttribute('aria-pressed', String(x.dataset.m === mode))); $('taxF').hidden = mode !== 'has'; ['pre', 'vat', 'post'].forEach(k => { $('t_' + k).value = tax[k]; $('t_' + k).classList.toggle('calc', !!calc[k]); }); }
  const full = () => { paintRows(); syncTaxUI(); $('invRows').hidden = !!invMode; $('invAddWrap').hidden = !!edit || !!invMode; $('invTax').hidden = !!edit; $('invTax').open = !!invMode; $('walNoteWrap').hidden = !!invMode; $('invLines').hidden = !!invMode; $('walRev').checked = false; update(); };

  // Fill the form from one saved row (edit). Blank stays "not recorded", 0 is shown as "بدون".
  function loadRow(rec) {
    reset(); const r = newRow(), q = LG.qtyOf(rec), unit = LG.unitGramsOf(rec), mg = Math.round(unit * 1000);
    edit = { id: rec.id, grams: rec.grams, qty: q, unitGrams: unit };
    r.type = rec.type || ''; r.k = String(rec.karat); r.legacyKarat = rec.type === 'bar' && rec.karat !== 24; r.qty = String(q); r.s = rec.stones || ''; r.pp = rec.purpose || ''; r.p = Number.isFinite(rec.paid) ? String(rec.paid) : '';
    if (Math.abs(unit * 1000 - mg) < 1e-6 && mg < 100000000) { r.gw = String(Math.floor(mg / 1000)); r.gf = mg % 1000 ? String(mg % 1000).padStart(3, '0').replace(/0+$/, '') : ''; if (r.gw === '0') r.gw = '0'; }
    else r.keepWeight = String(unit);
    ['making:mk', 'stamp:st'].forEach(p => { const [a, b] = p.split(':'); if (rec[a] === 0) r[b + 'N'] = true; else if (Number.isFinite(rec[a])) r[b] = String(rec[a]); }); r.mso = !!(rec.making !== undefined || rec.stamp !== undefined);
    r.basis = rec.basis || ''; r.stoneG = Number.isFinite(rec.stoneG) ? String(rec.stoneG) : ''; r.promise = rec.promise === 'full';
    rows = [r]; const d = String(rec.purchaseDate || '').split('-'); if (d.length === 3) { $('walDD').value = Number(d[2]); $('walMM').value = Number(d[1]); $('walYY').value = d[0]; }
    $('walNoteIn').value = rec.label || ''; full();
  }
  function loadInvoice(meta, date, paids) {
    reset(); invMode = { id: meta.id, paids: paids.slice() }; mode = meta.vatMode || 'unknown';
    tax = { pre: Number.isFinite(meta.subtotal) ? meta.subtotal.toFixed(2) : '', vat: Number.isFinite(meta.vat) ? meta.vat.toFixed(2) : '', post: Number.isFinite(meta.total) ? meta.total.toFixed(2) : '' };
    const d = String(date || '').split('-'); if (d.length === 3) { $('walDD').value = Number(d[2]); $('walMM').value = Number(d[1]); $('walYY').value = d[0]; } full();
  }
  function collect() {
    if (invMode) return { invoiceEdit: invMode.id, date: LG.parseDMY($('walDD').value, $('walMM').value, $('walYY').value), mode, sub: tax.pre, vat: tax.vat, total: tax.post, lines: [] };
    return { date: LG.parseDMY($('walDD').value, $('walMM').value, $('walYY').value), mode, sub: tax.pre, vat: tax.vat, total: tax.post, edit,
      lines: rows.map(r => ({ type: r.type, karat: r.type === 'bar' && !r.legacyKarat ? '24' : r.k, qty: r.qty, whole: r.gw, frac: r.gf, keepWeight: r.keepWeight && r.gw === '' && r.gf === '' ? r.keepWeight : null, paid: r.p, making: r.mk, makingNone: r.mkN, stamp: r.st, stampNone: r.stN, stones: r.s, purpose: r.pp, basis: r.basis, stoneG: r.stoneG, promise: r.promise ? 'full' : '', note: $('walNoteIn').value.trim() })) };
  }
  window.DHB_INVFORM = { reset() { reset(); full(); }, loadRow, loadInvoice, collect, update: () => update(true), setBusy(b) { root.dataset.busy = b ? '1' : ''; update(true); } };
  reset(); full();
})();
