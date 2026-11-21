// Load account.js with this file's own ?v= so a cached older account.js can never pair with a newer UI.
const A = await import("./account.js" + new URL(import.meta.url).search);
const $ = (id) => document.getElementById(id);
let mode = "in";
const show = (el, text, cls) => { el.hidden = !text; el.textContent = text || ""; el.className = "msg" + (cls ? " " + cls : ""); };
let gen = 0, shownKey = null, loadedFor = null;
// Private data must never outlive its user: wipe the list, form and messages on every auth change.
function wipe() {
  gen++; loadedFor = null; items = []; editing = null;
  $("list").innerHTML = ""; $("itemForm").reset(); $("iPur").hidden = true; $("formTitle").textContent = "إضافة قطعة"; $("iCancel").hidden = true; $("iSave").textContent = "حفظ القطعة";
  $("who").textContent = ""; $("vMail").textContent = "";
  for (const id of ["msg", "vMsg", "nMsg"]) show($(id), "");
  $("authForm").reset();
}
function view() {
  const u = A.currentUser();
  if (!(u && u.emailVerified)) { items = []; $("list").innerHTML = ""; }
  $("out").hidden = !!u; $("verify").hidden = !(u && !u.emailVerified); $("inn").hidden = !(u && u.emailVerified);
  if (u && !u.emailVerified) $("vMail").textContent = "البريد: " + u.email;
  if (u && u.emailVerified) { $("who").textContent = "مسجّل بالبريد: " + u.email; if (loadedFor !== u.uid) { loadedFor = u.uid; loadItems(); } }
}
function setMode(m) {
  mode = m; const up = m === "up";
  $("tabIn").className = "x-btn" + (up ? " ghost" : ""); $("tabUp").className = "x-btn" + (up ? "" : " ghost");
  $("go").textContent = up ? "إنشاء الحساب" : "دخول"; $("pwHint").hidden = !up; $("pw").autocomplete = up ? "new-password" : "current-password";
  $("forgot").hidden = up; show($("msg"), "");
}
async function run(btn, el, fn) {
  const g = gen;
  btn.disabled = true;
  try { await fn(); } catch (e) { if (g === gen) show(el, e.ar || "حدث خطأ غير متوقع. حاول مرة أخرى.", "err"); } finally { btn.disabled = false; }
}
$("tabIn").onclick = () => setMode("in"); $("tabUp").onclick = () => setMode("up");
$("authForm").onsubmit = (ev) => {
  ev.preventDefault();
  if ($("go").disabled) return; // a second Enter/tap while the first request is running
  const em = $("em").value.trim(), pw = $("pw").value;
  if (!em || !/^\S+@\S+\.\S+$/.test(em)) return show($("msg"), "اكتب بريدك الإلكتروني بصيغة صحيحة.", "err");
  if (mode === "up" && pw.length < 8) return show($("msg"), "كلمة السر لازم تكون 8 أحرف على الأقل.", "err");
  if (!pw) return show($("msg"), "اكتب كلمة السر.", "err");
  run($("go"), $("msg"), async () => {
    const r = await (mode === "up" ? A.signUp(em, pw) : A.signIn(em, pw));
    $("pw").value = ""; show($("msg"), ""); view();
    if (r && r.verificationSent === false) show($("vMsg"), "تم إنشاء حسابك، لكن تعذّر إرسال رسالة التأكيد. اضغط «أرسل الرسالة مرة أخرى».", "err");
  });
};
$("forgot").onclick = () => {
  if ($("forgot").disabled) return;
  const em = $("em").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(em)) return show($("msg"), "اكتب بريدك أولاً ثم اضغط «نسيت كلمة السر».", "err");
  run($("forgot"), $("msg"), async () => { await A.sendPasswordReset(em); show($("msg"), "لو كان هذا البريد مسجّلاً، سنرسل لك رسالة فيها رابط تغيير كلمة السر. راجع البريد المزعج أيضاً.", "ok"); });
};
$("vDone").onclick = () => run($("vDone"), $("vMsg"), async () => { const u = await A.refreshVerification(); if (!u.emailVerified) show($("vMsg"), "لم يظهر التأكيد بعد. اضغط الرابط في الرسالة ثم حاول مرة أخرى.", "err"); else view(); });
$("vResend").onclick = () => run($("vResend"), $("vMsg"), async () => { await A.resendVerification(); show($("vMsg"), "تم إرسال رسالة جديدة. استخدم أحدث رسالة.", "ok"); });
$("vOut").onclick = () => A.signOut();
$("outBtn").onclick = () => A.signOut();
const TYPES = { bar: "سبيكة", coin: "جنيه / عملة", jewelry: "مصوغات", scrap: "كسر" };
let items = [], editing = null, editSnap = null;
const sortKeys = (o) => Object.keys(o).sort().reduce((a, k) => { if (o[k] !== undefined) a[k] = o[k]; return a; }, {});
const newId = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function render() {
  $("list").innerHTML = items.length ? items.map((it) => `<li data-id="${esc(it.id)}"><b>${esc(it.label || TYPES[it.type])}</b><br>${TYPES[it.type]} · عيار ${esc(it.karat)} · ${esc(it.grams)} جم<br>الشراء: ${esc(it.purchaseDate)}${it.type === "jewelry" ? " · " + (it.purpose === "adornment" ? "زينة" : "ادخار") : ""}<div class="row"><button type="button" class="x-btn ghost" data-act="edit">تعديل</button><button type="button" class="x-btn ghost" data-act="del">حذف</button></div></li>`).join("") : '<li>لا توجد قطع محفوظة بعد.</li>';
}
async function loadItems() {
  const g = gen, uid = A.currentUser()?.uid;
  try { const d = await A.loadDoc("gold/items"); if (g !== gen || uid !== A.currentUser()?.uid) return; items = d?.items || []; render(); }
  catch (e) { if (g !== gen) return; loadedFor = null; show($("nMsg"), e.ar, "err"); }
}
// Every change goes through the versioned list update: it re-reads the newest list, applies only this change, and refuses (nothing saved)
// if it cannot do so safely. `items` is replaced by the saved list, so rows another tab changed are kept.
async function persist(mutate, okText) { const g = gen, uid = A.currentUser()?.uid; const r = await A.updateGoldItems(mutate, uid); if (g !== gen) return; items = r.items; show($("nMsg"), okText, "ok"); render(); }
function resetForm() { editing = null; editSnap = null; $("itemForm").reset(); $("iPur").hidden = true; $("formTitle").textContent = "إضافة قطعة"; $("iCancel").hidden = true; $("iSave").textContent = "حفظ القطعة"; }
$("iType").onchange = () => { $("iPur").hidden = $("iType").value !== "jewelry"; };
$("iCancel").onclick = resetForm;
$("itemForm").onsubmit = (ev) => {
  ev.preventDefault();
  if ($("iSave").disabled) return;
  const keepOld = editSnap && editSnap.grams > 0 && String($("iGrams").value).trim() === String(editSnap.grams);
  const PN = window.DHB_LEDGER && window.DHB_LEDGER.parseNumber, pr = PN ? PN($("iGrams").value, "grams") : { error: "none" };
  if (!keepOld && pr.error === "precision") return show($("nMsg"), "الوزن بالجرام لحد ٣ أرقام بعد العلامة (مللي جرام). مثال: 3.125 يعني ٣ جرام و١٢٥ مللي.", "err");
  const g = keepOld ? editSnap.grams : (pr.value !== undefined ? pr.value : NaN), type = $("iType").value, date = $("iDate").value;
  const pur = (document.querySelector('input[name=iP]:checked') || {}).value;
  if (!(g > 0)) return show($("nMsg"), "اكتب الوزن بالجرام بصيغة صحيحة.", "err");
  if (!date) return show($("nMsg"), "اختر تاريخ الشراء.", "err");
  if (type === "jewelry" && !pur) return show($("nMsg"), "اختر نية شراء المصوغات: زينة أو ادخار.", "err");
  const changed = { label: $("iLabel").value.trim(), type, karat: Number($("iKarat").value), grams: g, purchaseDate: date };
  const editId = editing, editBase = editSnap, newRec = { id: newId(), ...changed };
  if (type === "jewelry") { changed.purpose = pur; newRec.purpose = pur; }
  // Edit: change only the fields this page owns on the newest copy of the row (keeps paid, stones, fees and anything unknown).
  const mutate = (list) => {
    const cur = Array.isArray(list) ? list : [];
    if (!editId) return { items: cur.concat(newRec) };
    const now = cur.find((i) => i && i.id === editId);
    if (!now) throw Object.assign(new Error("gone"), { ar: "القطعة دي اتحذفت من مكان تاني. ما اتحفظش أي تعديل." });
    if (editBase && JSON.stringify(sortKeys(now)) !== JSON.stringify(sortKeys(editBase))) throw Object.assign(new Error("changed"), { ar: "القطعة دي اتغيّرت من مكان تاني بعد ما فتحتها. ما اتحفظش أي حاجة. حدّث الصفحة وراجع القيم وجرّب تاني." });
    return { items: cur.map((i) => { if (!i || i.id !== editId) return i; const n = { ...i, ...changed }; if (type !== "jewelry") delete n.purpose; return n; }) };
  };
  const gn = gen;
  run($("iSave"), $("nMsg"), async () => { await persist(mutate, editId ? "تم تعديل القطعة." : "تمت إضافة القطعة."); resetForm(); });
};
$("list").onclick = (ev) => {
  const b = ev.target.closest("button[data-act]"); if (!b) return;
  const id = b.closest("li").dataset.id, it = items.find((i) => i.id === id);
  if (b.dataset.act === "edit") {
    editing = id; editSnap = JSON.parse(JSON.stringify(it)); $("formTitle").textContent = "تعديل القطعة"; $("iCancel").hidden = false; $("iSave").textContent = "حفظ التعديل";
    $("iLabel").value = it.label || ""; $("iType").value = it.type; $("iKarat").value = String(it.karat); $("iGrams").value = it.grams; $("iDate").value = it.purchaseDate;
    $("iPur").hidden = it.type !== "jewelry"; document.querySelectorAll("input[name=iP]").forEach((r) => (r.checked = r.value === it.purpose));
    $("itemForm").scrollIntoView({ block: "center" });
  } else {
    const snap = JSON.parse(JSON.stringify(it));
    run(b, $("nMsg"), async () => { await persist((list) => { const cur = Array.isArray(list) ? list : [], now = cur.find((i) => i && i.id === id);
      if (!now) return { items: cur };
      if (JSON.stringify(sortKeys(now)) !== JSON.stringify(sortKeys(snap))) throw Object.assign(new Error("changed"), { ar: "القطعة دي اتغيّرت من مكان تاني بعد ما فتحتها. ما اتحفظش أي حاجة. حدّث الصفحة وراجع القيم وجرّب تاني." });
      return { items: cur.filter((i) => i && i.id !== id) }; }, "تم حذف القطعة."); });
  }
};
// Keep the focused field above the floating dock.
document.addEventListener("focusin", (e) => { const t = e.target; if (!t.getBoundingClientRect) return; const r = t.getBoundingClientRect(), lim = innerHeight - 160; if (r.bottom > lim) scrollBy(0, r.bottom - lim + 16); });
const keyOf = (u) => (u ? u.uid + ":" + !!u.emailVerified : "");
A.onChange((u) => { const k = keyOf(u); if (k === shownKey) return; if ((u?.uid || "") !== (shownKey || "").split(":")[0]) wipe(); shownKey = k; view(); });
shownKey = keyOf(A.currentUser());
setMode("in"); view();
A.validateSession();
