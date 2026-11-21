// Wallet add-piece helper: photo of an invoice -> OCR on this device -> suggestions the owner checks against the photo.
// The photo stays in memory (never uploaded, never saved) and is dropped when the panel closes or a piece is saved.
// Sibling modules load with this file's own ?v= so one deploy never mixes old and new versions.
const V = new URL(import.meta.url).search;
const { parseInvoice } = await import("./invoice-parse.js" + V);
const { createReview, FIELDS } = await import("./invoice-review-state.js" + V);

const $ = (id) => document.getElementById(id);
const LABEL = { karat: "العيار", grams: "الوزن بالجرام", purchaseDate: "تاريخ الشراء (سنة-شهر-يوم، بيتكتب في يوم / شهر / سنة)", paid: "إجمالي ما دفعته" };
const TARGET = { grams: "walGramsIn", paid: "walPaidIn", purchaseDate: "walDD" };
const ENGINE = new URL("../vendor/tesseract/", import.meta.url).href;
let objectUrl = null, review = null, busy = false, lastNote = "", curFile = null, curParsed = null, session = null;
const MAX_B64 = 700000; // one Firestore field must stay well under 1 MiB

async function ocrFile(file) {
  const T = await import(ENGINE + "tesseract.esm.min.js");
  const w = await (T.createWorker || T.default.createWorker)(["ara", "eng"], 1, {
    workerPath: ENGINE + "worker.min.js", corePath: ENGINE, langPath: ENGINE + "lang", gzip: false, workerBlobURL: false,
  });
  try {
    const r = await w.recognize(file, {}, { text: true, blocks: true });
    const words = (r.data.blocks || []).flatMap((b) => b.paragraphs).flatMap((p) => p.lines).flatMap((l) => l.words).filter((x) => /\d/.test(x.text));
    return { text: r.data.text || "", minDigitConfidence: words.length ? Math.min(...words.map((x) => x.confidence)) : 0 };
  } finally { await w.terminate(); }
}

function gate(on) { const g = $("walGate"); if (!g) return; g.hidden = !on; if (!on) { $("walRev").checked = false; document.querySelectorAll("input[name=walAtt]").forEach((x) => { x.checked = false; }); } const b = $("walAdd"); if (b && !(window.DHB_WAL_EDITING && window.DHB_WAL_EDITING())) b.textContent = on ? "تأكيد الإضافة" : "احفظ في حسابي"; }
function drop() { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } review = null; curFile = null; curParsed = null; session = null; gate(false); $("invBody").innerHTML = ""; $("invPanel").hidden = true; $("invFile").value = ""; }
function msg(t, kind) { const m = $("invMsg"); m.textContent = t || ""; m.className = "x-msg" + (kind ? " " + kind : ""); }

function applyConfirmed(f) {
  $("walRev").checked = false; // any change after the review resets it
  const v = review.rows[f].confirmed;
  if (f === "karat") { const b = document.querySelector(`.x-karat[data-set="walKarat"][data-value="${v}"]`); if (b) b.click(); }
  else if (f === "purchaseDate") { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v)); if (m) { [["walDD", m[3]], ["walMM", m[2]], ["walYY", m[1]]].forEach(([i, x]) => { $(i).value = String(Number(x)); }); } }
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
    } else { const t = document.createElement("span"); t.className = "x-note"; t.dataset.hint = f; t.textContent = (r.note || "لم يُقرأ") + ". اكتبه من الصورة."; sug.append(t); }
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
  const hint = wrap.querySelector("[data-hint]"); if (hint) hint.hidden = r.confirmed !== null;
  st.textContent = r.error || (r.confirmed !== null ? "✓ تم التأكيد وانتقلت القيمة للنموذج" : ""); st.className = "x-msg " + (r.error ? "err" : r.confirmed !== null ? "ok" : "");
}

async function onPick() {
  const file = $("invFile").files && $("invFile").files[0]; if (!file || busy) return;
  if (!/^image\//.test(file.type)) return msg("اختر صورة.", "err");
  drop(); busy = true; msg("بقرأ الصورة على جهازك، ممكن ياخد وقت…");
  objectUrl = URL.createObjectURL(file); $("invPanel").hidden = false; curFile = file; session = { id: null, saved: null }; gate(true);
  let parsed = null;
  try { const o = await ocrFile(file); parsed = parseInvoice(o.text, { minDigitConfidence: o.minDigitConfidence }); lastNote = parsed.suppressed ? parsed.karat.note : ""; msg(parsed.suppressed ? lastNote + ". اكتب القيم من الصورة بنفسك." : "القراءة خلصت. راجع كل قيمة بالصورة.", parsed.suppressed ? "err" : "ok"); }
  catch (e) { msg("القراءة الآلية ما اشتغلتش على جهازك. اكتب القيم من الصورة بنفسك.", "err"); }
  busy = false;
  if (curFile !== file) return; // the photo was closed while the reader was still working
  curParsed = parsed; review = createReview(parsed); render();
}

// Shrink the photo to a JPEG that fits one Firestore field. Returns {data (base64), type, bytes} or throws {code}.
async function prepareArchive() {
  if (!curFile) throw Object.assign(new Error("no photo"), { code: "NO_PHOTO" });
  let bmp; try { bmp = await createImageBitmap(curFile); } catch { throw Object.assign(new Error("decode"), { code: "DECODE" }); }
  for (const side of [1600, 1280, 1024, 800, 640]) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.68, 0.54]) {
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q)); if (!blob) continue;
      const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.readAsDataURL(blob); });
      if (data && data.length <= MAX_B64) return { data, type: "image/jpeg", bytes: blob.size };
    }
  }
  throw Object.assign(new Error("too big"), { code: "TOO_BIG" });
}
export function init() {
  if (!$("invFile")) return;
  $("invFile").addEventListener("change", onPick);
  // Any edit to the form after "تمت المراجعة" was ticked clears it, so the owner reviews what is actually being saved.
  $("walForm").addEventListener("input", (e) => { if (e.target && e.target.id !== "walRev" && e.target.name !== "walAtt") $("walRev").checked = false; });
  $("walForm").addEventListener("change", (e) => { if (e.target && e.target.id !== "walRev" && e.target.name !== "walAtt") $("walRev").checked = false; });
  addEventListener("pagehide", () => { if (objectUrl) drop(); });
  window.DHB_INVOICE = {
    active: () => !!objectUrl && !!curFile,
    session: () => session,
    prepareArchive,
    // After a piece was saved from this photo: keep the photo for another piece from the same invoice, clear what was confirmed.
    afterSave() { if (!objectUrl) return; review = createReview(curParsed); render(); $("walRev").checked = false; document.querySelectorAll("input[name=walAtt]").forEach((x) => { x.checked = false; }); msg("اتحفظت. لو في قطعة تانية في نفس الفاتورة راجعها من الصورة وأضفها، أو اضغط «إغلاق وحذف الصورة».", "ok"); },
    close() { drop(); msg(""); },
  };
}
init();
