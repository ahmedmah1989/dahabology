/* Wallet and account. The page and prices are open to everyone; saving a piece needs a signed-in, verified account.
 * Pieces live in the account's existing gold/items document ({v:1, items}); `paid` is an extra field per item.
 * Pieces saved on this device before accounts existed are never moved automatically, deleted or overwritten:
 * the user moves them one at a time. Firebase code (account.js) loads only when a session exists or a button needs it. */
(function () {
  const TYPES = ['bar', 'coin', 'jewelry', 'scrap'];
  const num = v => { const t = String(v == null ? '' : v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.').trim(); return t === '' ? NaN : Number(t); };
  // Build the cloud record. base: {id, k, g, paid, note}. Returns {error} or {rec}.
  function buildRecord(base, o) {
    if (!base || ![18, 21, 24].includes(Number(base.k)) || !Number.isFinite(base.g) || !(base.g > 0)) return { error: 'اكتب الوزن بأرقام صحيحة واختر العيار.' };
    if (!Number.isFinite(base.paid) || !(base.paid >= 0)) return { error: 'اكتب المبلغ المدفوع بأرقام صحيحة.' };
    if (!TYPES.includes(o.type)) return { error: 'اختر نوع القطعة.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '') || Number.isNaN(Date.parse(o.date))) return { error: 'اختر تاريخ الشراء.' };
    if (o.type === 'jewelry' && !['adornment', 'saving'].includes(o.purpose)) return { error: 'اختر نية شراء المصوغات: زينة أو ادخار.' };
    const det = o.details ? (o.details.stones || o.details.making !== undefined || o.details.tax !== undefined || o.details.stamp !== undefined ? o.details : {}) : {};
    const rec = { id: String(base.id), label: String(base.note || '').slice(0, 40), type: o.type, karat: Number(base.k), grams: base.g, purchaseDate: o.date, paid: base.paid };
    if (o.type === 'jewelry') rec.purpose = o.purpose;
    Object.keys(det).forEach(k => { if (det[k] !== undefined) rec[k] = det[k]; });
    return { rec };
  }
  // Append without touching other items. Same id already there: keep the existing one.
  function mergeItem(existing, rec) {
    const list = Array.isArray(existing) ? existing : [];
    if (list.some(i => i && i.id === rec.id)) return { items: list, added: false };
    return { items: list.concat(rec), added: true };
  }
  const removeItem = (existing, id) => (Array.isArray(existing) ? existing : []).filter(i => i && i.id !== id);
  // Wallet valuation needs a price paid. Items saved elsewhere without one are listed as unpriced, never valued as zero.
  function toWalletItems(cloud) {
    const priced = [], unpriced = [];
    (Array.isArray(cloud) ? cloud : []).forEach(i => {
      if (!i || !(Number(i.grams) > 0) || ![18, 21, 24].includes(Number(i.karat))) return;
      (Number.isFinite(i.paid) && i.paid >= 0 ? priced : unpriced).push({ id: i.id, k: String(i.karat), g: Number(i.grams), paid: i.paid, note: i.label || '', rec: i });
    });
    return { priced, unpriced };
  }
  if (typeof module !== 'undefined') module.exports = { buildRecord, mergeItem, removeItem, toWalletItems, num };
  if (typeof document === 'undefined' || !document.getElementById('walForm')) return;

  const $ = id => document.getElementById(id);
  const src = document.currentScript && document.currentScript.src;
  const SESSION = 'dahabology.session.v1', KEY = 'dhb-wallet-v1';
  const say = (id, t, cls) => { const m = $(id); m.textContent = t || ''; m.className = 'x-msg' + (cls ? ' ' + cls : ''); };
  const locals = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  let A = null, gen = 0, chain = Promise.resolve(), owner = null;
  const lib = () => A ? Promise.resolve(A) : import(new URL('account.js' + new URL(src).search, src).href).then(m => (A = m));
  const paint = () => { if (window.DHB_WALLET_RENDER) window.DHB_WALLET_RENDER(); };
  const serial = fn => (chain = chain.then(fn, fn)); // one account write at a time on this page

  function setCloud(items) {
    const w = toWalletItems(items);
    window.DHB_CLOUD_ITEMS = w.priced;
    const n = $('walUnpriced'); n.hidden = w.unpriced.length === 0;
    n.textContent = w.unpriced.length ? 'في حسابك ' + w.unpriced.length + ' قطعة من غير سعر شراء، ما اتحسبتش في القيمة هنا.' : '';
    paint();
  }
  function clearCloud() { gen++; owner = null; window.DHB_CLOUD_ITEMS = []; $('walUnpriced').hidden = true; paint(); }
  async function refresh() {
    const g = ++gen;
    if (!localStorage.getItem(SESSION)) { if (owner) clearCloud(); return; }
    const L = await lib(); await L.validateSession();
    const u = L.currentUser();
    if (g !== gen) return;
    if (!u || !u.emailVerified) { clearCloud(); return; }
    if (owner && owner !== u.uid) { window.DHB_CLOUD_ITEMS = []; paint(); }
    try {
      const d = await L.loadDoc('gold/items');
      if (g !== gen || L.currentUser()?.uid !== u.uid) return;
      owner = u.uid; setCloud(d && d.items);
    } catch (e) { if (g === gen) say('walMsg', (e && e.ar) || 'تعذّر تحميل قطع حسابك.', 'err'); }
  }

  // Run a read-modify-write on the account's list. mutate(existingItems) -> {items, ...info}
  async function writeAccount(mutate, noticeId, loginId) {
    const L = await lib(), u = L.currentUser();
    if (!u) { $(loginId).hidden = false; say(noticeId, 'لازم تسجّل الدخول الأول علشان القطعة تتحفظ في حسابك. ما اتحفظش أي حاجة.', 'err'); return null; }
    if (!u.emailVerified) { $(loginId).hidden = false; say(noticeId, 'حسابك محتاج تأكيد البريد. أكمل التأكيد من صفحة حسابي ثم ارجع.', 'err'); return null; }
    return serial(async () => {
      const r = await L.updateGoldItems(mutate, u.uid);
      if (r.items) { owner = u.uid; setCloud(r.items); }
      return r;
    });
  }

  // ---- add or edit a piece: needs an account ----
  const LG = () => window.DHB_LEDGER;
  const radio = n => (document.querySelector('input[name=' + n + ']:checked') || {}).value;
  const syncMore = () => { const w = radio('walS') === 'with'; $('walSOnly').hidden = !w; $('walSG').hidden = !(w && $('walBasis').value === 'total'); };
  document.querySelectorAll('input[name=walS]').forEach(x => x.addEventListener('change', syncMore)); $('walBasis').addEventListener('change', syncMore);
  $('walZero').addEventListener('click', () => ['walMk', 'walTx', 'walSt'].forEach(i => { if ($(i).value.trim() === '') $(i).value = '0'; }));
  $('walType').addEventListener('change', () => { $('walPur').hidden = $('walType').value !== 'jewelry'; });
  let editingId = null;
  function resetForm() {
    editingId = null;
    ['walGramsIn', 'walPaidIn', 'walNoteIn', 'walDD', 'walMM', 'walYY', 'walMk', 'walTx', 'walSt', 'walStoneG'].forEach(i => { $(i).value = ''; }); $('walType').value = ''; $('walPur').hidden = true; $('walBasis').value = ''; $('walPromise').checked = false;
    document.querySelectorAll('input[name=walP],input[name=walS]').forEach(x => { x.checked = false; }); syncMore();
    $('walAdd').textContent = 'احفظ في حسابي'; $('walCancel').hidden = true;
  }
  $('walCancel').addEventListener('click', () => { resetForm(); say('walMsg', ''); });
  const formDetails = () => LG().readDetails({ stones: radio('walS'), basis: $('walBasis').value, stoneG: $('walStoneG').value, promise: $('walPromise').checked ? 'full' : '', making: $('walMk').value, tax: $('walTx').value, stamp: $('walSt').value });
  // Fill the form from a saved row (edit). Shown values are exactly what is saved; blank means not recorded.
  window.DHB_CLOUD_EDIT = id => {
    const r = (window.DHB_CLOUD_ITEMS || []).find(x => x.id === id), rec = r && r.rec; if (!rec) return;
    resetForm(); editingId = id; const d = String(rec.purchaseDate || '').split('-');
    $('walGramsIn').value = rec.grams; $('walPaidIn').value = Number.isFinite(rec.paid) ? rec.paid : ''; $('walNoteIn').value = rec.label || '';
    if (d.length === 3) { $('walDD').value = Number(d[2]); $('walMM').value = Number(d[1]); $('walYY').value = d[0]; }
    $('walType').value = rec.type || ''; $('walPur').hidden = rec.type !== 'jewelry'; document.querySelectorAll('input[name=walP]').forEach(x => { x.checked = x.value === rec.purpose; });
    document.querySelectorAll('input[name=walS]').forEach(x => { x.checked = x.value === rec.stones; });
    ['making:walMk', 'tax:walTx', 'stamp:walSt', 'stoneG:walStoneG'].forEach(p => { const [k, i] = p.split(':'); $(i).value = Number.isFinite(rec[k]) ? rec[k] : ''; });
    $('walBasis').value = rec.basis || ''; $('walPromise').checked = rec.promise === 'full'; syncMore();
    document.querySelectorAll('.x-karat[data-set=walKarat]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(rec.karat)))); $('walKarat').value = String(rec.karat);
    $('walMore').open = true; $('walAdd').textContent = 'احفظ التعديل'; $('walCancel').hidden = false;
    say('walMsg', Number.isFinite(rec.additions) && rec.additions > 0 ? 'القطعة دي فيها مبلغ "إضافات" قديم محفوظ زي ما هو. التعديل ما بيغيّرهوش.' : '');
    $('walForm').scrollIntoView({ block: 'start' });
  };
  $('walForm').addEventListener('submit', async () => {
    const btn = $('walAdd'); if (btn.disabled) return;
    const date = LG().parseDMY($('walDD').value, $('walMM').value, $('walYY').value);
    if (!date) return say('walMsg', 'اكتب تاريخ الشراء صح: يوم / شهر / سنة.', 'err');
    if (!radio('walS')) return say('walMsg', 'اختر: القطعة بفصوص ولا بدون فصوص.', 'err');
    const dt = formDetails(); if (dt.error) return say('walMsg', 'راجع التفاصيل الاختيارية (أرقام صحيحة، ووزن الفصوص أقل من الوزن الكلي).', 'err');
    const id = editingId || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const b = buildRecord({ id, k: $('walKarat').value, g: num($('walGramsIn').value), paid: num($('walPaidIn').value), note: $('walNoteIn').value.trim() },
      { type: $('walType').value, date, purpose: radio('walP'), details: dt.details });
    if (b.error) return say('walMsg', b.error, 'err');
    if (dt.details.stoneG !== undefined && dt.details.stoneG >= b.rec.grams) return say('walMsg', 'وزن الفصوص لازم يكون أقل من الوزن الكلي.', 'err');
    btn.disabled = true; say('walMsg', '');
    try {
      const was = editingId;
      const r = await writeAccount(items => {
        if (!was) return mergeItem(items, b.rec);
        const cur = Array.isArray(items) ? items : [];
        if (!cur.some(i => i && i.id === was)) throw Object.assign(new Error('gone'), { ar: 'القطعة دي اتحذفت من مكان تاني. ما اتحفظش أي تعديل.' });
        // Only fields this form owns change on the newest copy; anything else on the row (legacy additions, unknown fields) is kept.
        return { items: cur.map(i => { if (!i || i.id !== was) return i; const n = Object.assign({}, i, { label: b.rec.label, type: b.rec.type, karat: b.rec.karat, grams: b.rec.grams, purchaseDate: b.rec.purchaseDate, paid: b.rec.paid });
          if (b.rec.type === 'jewelry') n.purpose = b.rec.purpose; else delete n.purpose;
          ['stones', 'basis', 'stoneG', 'promise', 'making', 'tax', 'stamp'].forEach(k => { delete n[k]; }); return Object.assign(n, dt.details); }) };
      }, 'walMsg', 'walLogin');
      if (r) { say('walMsg', was ? 'اتعدّلت في حسابك.' : 'اتحفظت في حسابك.', 'ok'); resetForm(); }
    } catch (e) { say('walMsg', (e && e.ar) || 'تعذّر الحفظ. ما اتحفظش أي حاجة، حاول مرة أخرى.', 'err'); }
    finally { btn.disabled = false; }
  });
  // One tap on an old row: set only the stones choice, and only if nobody has set it meanwhile. Nothing else changes.
  window.DHB_CLOUD_CLASSIFY = async (id, stones) => {
    if (!['with', 'without'].includes(stones)) return;
    try {
      let skipped = false;
      const r = await writeAccount(items => { const cur = Array.isArray(items) ? items : []; const t = cur.find(i => i && i.id === id);
        if (!t) throw Object.assign(new Error('gone'), { ar: 'القطعة دي اتحذفت من مكان تاني. ما اتحفظش أي تعديل.' });
        if (t.stones) { skipped = true; return {}; }
        return { items: cur.map(i => (i && i.id === id ? Object.assign({}, i, { stones }) : i)) }; }, 'walMsg', 'walLogin');
      if (skipped) await refresh();
      if (r) say('walMsg', skipped ? 'القطعة دي اتحدد لها اختيار من مكان تاني، سيبناه زي ما هو.' : 'اتحفظ اختيارك.', 'ok');
    } catch (e) { say('walMsg', (e && e.ar) || 'تعذّر الحفظ. ما اتغيّرش أي حاجة، حاول مرة أخرى.', 'err'); }
  };
  // ---- delete a piece from the account ----
  window.DHB_CLOUD_DELETE = async id => {
    try { const r = await writeAccount(items => ({ items: removeItem(items, id) }), 'walMsg', 'walLogin'); if (r) say('walMsg', 'اتحذفت من حسابك.', 'ok'); }
    catch (e) { say('walMsg', (e && e.ar) || 'تعذّر الحذف. حاول مرة أخرى.', 'err'); }
  };

  // ---- move one device piece into the account (user's choice, one at a time) ----
  function fillPieces() {
    const sel = $('waPiece'), keep = sel.value, items = locals();
    sel.replaceChildren();
    items.forEach(i => { const o = document.createElement('option'); o.value = i.id; o.textContent = (i.note || 'ذهب') + ' • عيار ' + i.k + ' • ' + i.g + ' جم • دفعت ' + i.paid; sel.append(o); });
    if (keep && items.some(i => i.id === keep)) sel.value = keep;
    $('waBox').hidden = items.length === 0;
  }
  $('waType').addEventListener('change', () => { $('waPur').hidden = $('waType').value !== 'jewelry'; });
  $('waPiece').addEventListener('focus', fillPieces);
  new MutationObserver(fillPieces).observe($('walRows'), { childList: true });
  fillPieces();
  $('waSave').addEventListener('click', async () => {
    const btn = $('waSave'); if (btn.disabled) return;
    const l = locals().find(i => i.id === $('waPiece').value);
    const b = buildRecord(l && { id: l.id, k: l.k, g: l.g, paid: l.paid, note: l.note }, { type: $('waType').value, date: $('waDate').value || '', purpose: (document.querySelector('input[name=waP]:checked') || {}).value });
    if (b.error) return say('waMsg', b.error, 'err');
    btn.disabled = true; say('waMsg', '');
    try {
      const r = await writeAccount(items => mergeItem(items, b.rec), 'waMsg', 'waLogin');
      if (r) say('waMsg', r.added ? 'اتنقلت إلى حسابك مع السعر الذي دفعته. القطعة لسه محفوظة على جهازك كمان.' : 'القطعة دي موجودة في حسابك بالفعل. لم يتغيّر شيء.', 'ok');
    } catch (e) { say('waMsg', (e && e.ar) || 'تعذّر النقل. القطعة لسه على جهازك، حاول مرة أخرى.', 'err'); }
    finally { btn.disabled = false; }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { fillPieces(); refresh(); } });
  window.addEventListener('storage', e => { if (e.key === SESSION) refresh(); });
  refresh();
})();
