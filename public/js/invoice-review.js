// Wallet add-piece helper: photo of an invoice -> OCR on this device -> suggestions the owner checks against the photo.
// The photo stays in memory (never uploaded, never saved) and is dropped when the panel closes or a piece is saved.
import { parseInvoice } from "./invoice-parse.js";
import { createReview, FIELDS } from "./invoice-review-state.js";

const $ = (id) => document.getElementById(id);
const LABEL = { karat: "العيار", grams: "الوزن بالجرام", purchaseDate: "تاريخ الشراء (سنة-شهر-يوم)", paid: "إجمالي ما دفعته" };
const TARGET = { grams: "walGramsIn", paid: "walPaidIn", purchaseDate: "walDate" };
const ENGINE = new URL("../vendor/tesseract/", import.meta.url).href;
let objectUrl = null, review = null, busy = false;

async function ocrFile(file) {
  const T = await import(ENGINE + "tesseract.esm.min.js");
  const w = await (T.createWorker || T.default.createWorker)(["ara", "eng"], 1, {
    workerPath: ENGINE + "worker.min.js", corePath: ENGINE, langPath: ENGINE + "lang", gzip: false, workerBlobURL: false,
  });
  try { const r = await w.recognize(file); return r.data.text || ""; } finally { await w.terminate(); }
}

function drop() { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } review = null; $("invBody").innerHTML = ""; $("invPanel").hidden = true; $("invFile").value = ""; }
function msg(t, kind) { const m = $("invMsg"); m.textContent = t || ""; m.className = "x-msg" + (kind ? " " + kind : ""); }

function applyConfirmed(f) {
  const v = review.rows[f].confirmed;
  if (f === "karat") { const b = document.querySelector(`.x-karat[data-set="walKarat"][data-value="${v}"]`); if (b) b.click(); }
  else { const el = $(TARGET[f]); el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
}

function render() {
  const body = $("invBody"); body.innerHTML = "";
  const img = document.createElement("img"); img.src = objectUrl; img.alt = "صورة الفاتورة"; img.id = "invImg"; img.style.cssText = "width:100%;max-height:46vh;object-fit:contain;border-radius:12px;background:#0001;cursor:zoom-in";
  img.onclick = () => { const z = img.style.maxHeight === "none"; img.style.maxHeight = z ? "46vh" : "none"; img.style.cursor = z ? "zoom-in" : "zoom-out"; };
  body.append(img);
  const note = document.createElement("p"); note.className = "x-note"; note.textContent = "القراءة الآلية قد تغلط في رقم وتطلع رقم معقول. قارن كل قيمة بالصورة، واضغط «أكّد» عشان تنتقل للنموذج. اللي ما تأكدش مش هيتنقل.";
  body.append(note);
  for (const f of FIELDS) {
    const r = review.rows[f], wrap = document.createElement("div"); wrap.className = "x-card"; wrap.style.margin = "10px 0"; wrap.dataset.field = f;
    const lab = document.createElement("label"); lab.className = "x-field"; lab.textContent = LABEL[f];
    const inp = document.createElement("input"); inp.value = r.input; inp.setAttribute("inputmode", f === "purchaseDate" ? "numeric" : "decimal"); inp.autocomplete = "off";
    inp.oninput = () => { review.setInput(f, inp.value); rowState(wrap, f); };
    lab.append(inp); wrap.append(lab);
    const sug = document.createElement("div"); sug.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:6px 0";
    if (r.suggestions.length) {
      const t = document.createElement("span"); t.className = "x-note"; t.textContent = "مقترح (غير مؤكد):"; sug.append(t);
      r.suggestions.forEach((s, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "x-btn ghost"; b.textContent = s; b.onclick = () => { inp.value = review.suggest(f, i); rowState(wrap, f); }; sug.append(b); });
    } else { const t = document.createElement("span"); t.className = "x-note"; t.textContent = (r.note || "لم يُقرأ") + ". اكتبه من الصورة."; sug.append(t); }
    wrap.append(sug);
    const act = document.createElement("div"); act.className = "x-actions";
    const ok = document.createElement("button"); ok.type = "button"; ok.className = "x-btn"; ok.textContent = "أكّد"; ok.dataset.confirm = f;
    ok.onclick = () => { if (review.confirm(f)) { applyConfirmed(f); } rowState(wrap, f); };
    act.append(ok); wrap.append(act);
    const st = document.createElement("p"); st.className = "x-msg"; st.setAttribute("role", "status"); st.dataset.state = f; wrap.append(st);
    body.append(wrap);
  }
  const done = document.createElement("button"); done.type = "button"; done.className = "x-btn ghost"; done.textContent = "إغلاق وحذف الصورة"; done.onclick = () => { drop(); msg(""); };
  body.append(done);
}
function rowState(wrap, f) {
  const r = review.rows[f], st = wrap.querySelector("[data-state]");
  st.textContent = r.error || (r.confirmed !== null ? "✓ تم التأكيد وانتقلت القيمة للنموذج" : ""); st.className = "x-msg " + (r.error ? "err" : r.confirmed !== null ? "ok" : "");
}

async function onPick() {
  const file = $("invFile").files && $("invFile").files[0]; if (!file || busy) return;
  if (!/^image\//.test(file.type)) return msg("اختر صورة.", "err");
  drop(); busy = true; msg("بقرأ الصورة على جهازك، ممكن ياخد وقت…");
  objectUrl = URL.createObjectURL(file); $("invPanel").hidden = false;
  let parsed = null;
  try { parsed = parseInvoice(await ocrFile(file)); msg("القراءة خلصت. راجع كل قيمة بالصورة.", "ok"); }
  catch (e) { msg("القراءة الآلية ما اشتغلتش على جهازك. اكتب القيم من الصورة بنفسك.", "err"); }
  review = createReview(parsed); render(); busy = false;
}

export function init() { if ($("invFile")) $("invFile").addEventListener("change", onPick); }
init();
