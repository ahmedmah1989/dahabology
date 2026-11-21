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
    const rec = { id: String(base.id), label: String(base.note || '').slice(0, 40), type: o.type, karat: Number(base.k), grams: base.g, purchaseDate: o.date, paid: base.paid };
    if (o.type === 'jewelry') rec.purpose = o.purpose;
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
      (Number.isFinite(i.paid) && i.paid >= 0 ? priced : unpriced).push({ id: i.id, k: String(i.karat), g: Number(i.grams), paid: i.paid, note: i.label || '' });
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
      const d = await L.loadDoc('gold/items'); // fresh read right before the write
      if (L.currentUser()?.uid !== u.uid) throw Object.assign(new Error('user changed'), { ar: 'تغيّر الحساب. حاول مرة أخرى.' });
      const r = mutate(d && d.items);
      if (r.items) { await L.saveDoc('gold/items', { v: (d && d.v) || 1, items: r.items }); owner = u.uid; setCloud(r.items); }
      return r;
    });
  }

  // ---- add a new piece: needs an account ----
  $('walType').addEventListener('change', () => { $('walPur').hidden = $('walType').value !== 'jewelry'; });
  $('walForm').addEventListener('submit', async () => {
    const btn = $('walAdd'); if (btn.disabled) return;
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const b = buildRecord({ id, k: $('walKarat').value, g: num($('walGramsIn').value), paid: num($('walPaidIn').value), note: $('walNoteIn').value.trim() },
      { type: $('walType').value, date: $('walDate').value, purpose: (document.querySelector('input[name=walP]:checked') || {}).value });
    if (b.error) return say('walMsg', b.error, 'err');
    btn.disabled = true; say('walMsg', '');
    try {
      const r = await writeAccount(items => mergeItem(items, b.rec), 'walMsg', 'walLogin');
      if (r) {
        say('walMsg', 'اتحفظت في حسابك.', 'ok');
        ['walGramsIn', 'walPaidIn', 'walNoteIn', 'walDate'].forEach(i => { $(i).value = ''; }); $('walType').value = ''; $('walPur').hidden = true;
        document.querySelectorAll('input[name=walP]').forEach(x => { x.checked = false; });
      }
    } catch (e) { say('walMsg', (e && e.ar) || 'تعذّر الحفظ. ما اتحفظش أي حاجة، حاول مرة أخرى.', 'err'); }
    finally { btn.disabled = false; }
  });
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
