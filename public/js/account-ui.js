import * as A from "./account.js";
const $ = (id) => document.getElementById(id);
let mode = "in";
const show = (el, text, cls) => { el.hidden = !text; el.textContent = text || ""; el.className = "msg" + (cls ? " " + cls : ""); };
function view() {
  const u = A.currentUser();
  $("out").hidden = !!u; $("verify").hidden = !(u && !u.emailVerified); $("inn").hidden = !(u && u.emailVerified);
  if (u && !u.emailVerified) $("vMail").textContent = "البريد: " + u.email;
  if (u && u.emailVerified) { $("who").textContent = "مسجّل بالبريد: " + u.email; loadItems(); }
}
function setMode(m) {
  mode = m; const up = m === "up";
  $("tabIn").className = "x-btn" + (up ? " ghost" : ""); $("tabUp").className = "x-btn" + (up ? "" : " ghost");
  $("go").textContent = up ? "إنشاء الحساب" : "دخول"; $("pwHint").hidden = !up; $("pw").autocomplete = up ? "new-password" : "current-password";
  $("forgot").hidden = up; show($("msg"), "");
}
async function run(btn, el, fn) {
  btn.disabled = true;
  try { await fn(); } catch (e) { show(el, e.ar || "حدث خطأ غير متوقع. حاول مرة أخرى.", "err"); } finally { btn.disabled = false; }
}
$("tabIn").onclick = () => setMode("in"); $("tabUp").onclick = () => setMode("up");
$("authForm").onsubmit = (ev) => {
  ev.preventDefault();
  const em = $("em").value.trim(), pw = $("pw").value;
  if (!em || !/^\S+@\S+\.\S+$/.test(em)) return show($("msg"), "اكتب بريدك الإلكتروني بصيغة صحيحة.", "err");
  if (mode === "up" && pw.length < 8) return show($("msg"), "كلمة السر لازم تكون 8 أحرف على الأقل.", "err");
  if (!pw) return show($("msg"), "اكتب كلمة السر.", "err");
  run($("go"), $("msg"), async () => { await (mode === "up" ? A.signUp(em, pw) : A.signIn(em, pw)); $("pw").value = ""; show($("msg"), ""); view(); });
};
$("forgot").onclick = () => {
  const em = $("em").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(em)) return show($("msg"), "اكتب بريدك أولاً ثم اضغط «نسيت كلمة السر».", "err");
  run($("forgot"), $("msg"), async () => { await A.sendPasswordReset(em); show($("msg"), "لو كان هذا البريد مسجّلاً، سنرسل لك رسالة فيها رابط تغيير كلمة السر. راجع البريد المزعج أيضاً.", "ok"); });
};
$("vDone").onclick = () => run($("vDone"), $("vMsg"), async () => { const u = await A.refreshVerification(); if (!u.emailVerified) show($("vMsg"), "لم يظهر التأكيد بعد. اضغط الرابط في الرسالة ثم حاول مرة أخرى.", "err"); else view(); });
$("vResend").onclick = () => run($("vResend"), $("vMsg"), async () => { await A.resendVerification(); show($("vMsg"), "تم إرسال رسالة جديدة. استخدم أحدث رسالة.", "ok"); });
$("vOut").onclick = () => { A.signOut(); view(); };
$("outBtn").onclick = () => { A.signOut(); items = []; render(); resetForm(); view(); };
const TYPES = { bar: "سبيكة", coin: "جنيه / عملة", jewelry: "مصوغات", scrap: "كسر" };
let items = [], editing = null;
const newId = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function render() {
  $("list").innerHTML = items.length ? items.map((it) => `<li data-id="${esc(it.id)}"><b>${esc(it.label || TYPES[it.type])}</b><br>${TYPES[it.type]} · عيار ${esc(it.karat)} · ${esc(it.grams)} جم<br>الشراء: ${esc(it.purchaseDate)}${it.type === "jewelry" ? " · " + (it.purpose === "adornment" ? "زينة" : "ادخار") : ""}<div class="row"><button type="button" class="x-btn ghost" data-act="edit">تعديل</button><button type="button" class="x-btn ghost" data-act="del">حذف</button></div></li>`).join("") : '<li>لا توجد قطع محفوظة بعد.</li>';
}
async function loadItems() { try { const d = await A.loadDoc("gold/items"); items = d?.items || []; render(); } catch (e) { show($("nMsg"), e.ar, "err"); } }
async function persist(okText) { await A.saveDoc("gold/items", { v: 1, items }); show($("nMsg"), okText, "ok"); render(); }
function resetForm() { editing = null; $("itemForm").reset(); $("iPur").hidden = true; $("formTitle").textContent = "إضافة قطعة"; $("iCancel").hidden = true; $("iSave").textContent = "حفظ القطعة"; }
$("iType").onchange = () => { $("iPur").hidden = $("iType").value !== "jewelry"; };
$("iCancel").onclick = resetForm;
$("itemForm").onsubmit = (ev) => {
  ev.preventDefault();
  const g = Number(String($("iGrams").value).replace(",", ".")), type = $("iType").value, date = $("iDate").value;
  const pur = (document.querySelector('input[name=iP]:checked') || {}).value;
  if (!(g > 0)) return show($("nMsg"), "اكتب الوزن بالجرام بصيغة صحيحة.", "err");
  if (!date) return show($("nMsg"), "اختر تاريخ الشراء.", "err");
  if (type === "jewelry" && !pur) return show($("nMsg"), "اختر نية شراء المصوغات: زينة أو ادخار.", "err");
  const rec = { id: editing || newId(), label: $("iLabel").value.trim(), type, karat: Number($("iKarat").value), grams: g, purchaseDate: date };
  if (type === "jewelry") rec.purpose = pur;
  const prev = items.slice();
  items = editing ? items.map((i) => (i.id === editing ? rec : i)) : items.concat(rec);
  run($("iSave"), $("nMsg"), async () => { try { await persist(editing ? "تم تعديل القطعة." : "تمت إضافة القطعة."); resetForm(); } catch (e) { items = prev; render(); throw e; } });
};
$("list").onclick = (ev) => {
  const b = ev.target.closest("button[data-act]"); if (!b) return;
  const id = b.closest("li").dataset.id, it = items.find((i) => i.id === id);
  if (b.dataset.act === "edit") {
    editing = id; $("formTitle").textContent = "تعديل القطعة"; $("iCancel").hidden = false; $("iSave").textContent = "حفظ التعديل";
    $("iLabel").value = it.label || ""; $("iType").value = it.type; $("iKarat").value = String(it.karat); $("iGrams").value = it.grams; $("iDate").value = it.purchaseDate;
    $("iPur").hidden = it.type !== "jewelry"; document.querySelectorAll("input[name=iP]").forEach((r) => (r.checked = r.value === it.purpose));
    $("itemForm").scrollIntoView({ block: "center" });
  } else {
    const prev = items.slice(); items = items.filter((i) => i.id !== id);
    run(b, $("nMsg"), async () => { try { await persist("تم حذف القطعة."); } catch (e) { items = prev; render(); throw e; } });
  }
};
setMode("in"); view();
