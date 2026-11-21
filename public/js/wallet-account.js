/* Wallet to account: optional, one piece at a time, chosen by the user.
 * The wallet itself stays free and local. Nothing is uploaded automatically, nothing is deleted or overwritten on the device.
 * Firebase code (account.js) is loaded only when the user presses the save button. */
(function () {
  const TYPES = ['bar', 'coin', 'jewelry', 'scrap'];
  // Build the cloud record in the existing gold/items schema. Returns {error} or {rec}.
  function buildRecord(local, o) {
    if (!local || !Number.isFinite(local.g) || !(local.g > 0) || ![18, 21, 24].includes(Number(local.k))) return { error: 'قطعة غير صالحة.' };
    if (!TYPES.includes(o.type)) return { error: 'اختر نوع القطعة.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '') || Number.isNaN(Date.parse(o.date))) return { error: 'اختر تاريخ الشراء.' };
    if (o.type === 'jewelry' && !['adornment', 'saving'].includes(o.purpose)) return { error: 'اختر نية شراء المصوغات: زينة أو ادخار.' };
    const rec = { id: String(local.id), label: String(local.note || '').slice(0, 40), type: o.type, karat: Number(local.k), grams: local.g, purchaseDate: o.date };
    if (o.type === 'jewelry') rec.purpose = o.purpose;
    return { rec };
  }
  // Add rec to the existing list without touching other items. Same id already there: leave it as is.
  function mergeItem(existing, rec) {
    const list = Array.isArray(existing) ? existing : [];
    if (list.some(i => i && i.id === rec.id)) return { items: list, added: false };
    return { items: list.concat(rec), added: true };
  }
  if (typeof module !== 'undefined') module.exports = { buildRecord, mergeItem };
  if (typeof document === 'undefined' || !document.getElementById('waSave')) return;

  const $ = id => document.getElementById(id);
  const src = document.currentScript && document.currentScript.src;
  const KEY = 'dhb-wallet-v1';
  const msg = (t, cls) => { const m = $('waMsg'); m.textContent = t || ''; m.className = 'x-msg' + (cls ? ' ' + cls : ''); };
  const locals = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  function fillPieces() {
    const sel = $('waPiece'), keep = sel.value, items = locals();
    sel.replaceChildren();
    items.forEach(i => { const o = document.createElement('option'); o.value = i.id; o.textContent = (i.note || 'ذهب') + ' • عيار ' + i.k + ' • ' + i.g + ' جم'; sel.append(o); });
    if (keep && items.some(i => i.id === keep)) sel.value = keep;
    $('waBox').hidden = items.length === 0;
  }
  $('waType').addEventListener('change', () => { $('waPur').hidden = $('waType').value !== 'jewelry'; });
  $('waPiece').addEventListener('focus', fillPieces);
  document.addEventListener('visibilitychange', fillPieces);
  new MutationObserver(fillPieces).observe($('walRows'), { childList: true });
  fillPieces();

  $('waSave').addEventListener('click', async () => {
    const btn = $('waSave'); if (btn.disabled) return;
    const local = locals().find(i => i.id === $('waPiece').value);
    const purpose = (document.querySelector('input[name=waP]:checked') || {}).value;
    const b = buildRecord(local, { type: $('waType').value, date: $('waDate').value, purpose });
    if (b.error) return msg(b.error, 'err');
    btn.disabled = true; msg('');
    try {
      const A = await import(new URL('account.js' + new URL(src).search, src).href);
      const u = A.currentUser();
      if (!u) { $('waLogin').hidden = false; return msg('لازم تسجّل الدخول الأول علشان القطعة تتحفظ في حسابك. قطعتك على الجهاز زي ما هي.', 'err'); }
      if (!u.emailVerified) { $('waLogin').hidden = false; return msg('حسابك لسه محتاج تأكيد البريد. أكمل التأكيد من صفحة حسابي ثم ارجع.', 'err'); }
      const d = await A.loadDoc('gold/items');
      const m = mergeItem(d && d.items, b.rec);
      if (!m.added) return msg('القطعة دي محفوظة في حسابك بالفعل. لم يتغيّر شيء.', 'ok');
      await A.saveDoc('gold/items', { v: (d && d.v) || 1, items: m.items });
      msg('اتحفظت في حسابك. القطعة لسه موجودة على جهازك كمان، والسعر الذي دفعته يفضل على الجهاز فقط.', 'ok');
    } catch (e) { msg((e && e.ar) || 'تعذّر الحفظ. القطعة لسه على جهازك، حاول مرة أخرى.', 'err'); }
    finally { btn.disabled = false; }
  });
})();
