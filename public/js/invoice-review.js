// Wallet add-piece helper: photo of an invoice shown next to manual entry, each value typed and confirmed by the owner.
// Automatic reading is OFF: it made confident wrong digits in tests, so no value or suggestion is ever produced from the photo.
// OCR_SUGGESTIONS is a kill switch kept false until a reader is proven on real invoices.
// The photo stays in memory (never uploaded, never saved) and is dropped when the panel closes or a piece is saved.
// Sibling modules load with this file's own ?v= so one deploy never mixes old and new versions.
const V = new URL(import.meta.url).search;
const { parseInvoice } = await import("./invoice-parse.js" + V);
const { createReview } = await import("./invoice-review-state.js" + V);

const $ = (id) => document.getElementById(id);
const _LABEL = { karat: "العيار", grams: "الوزن بالجرام", purchaseDate: "تاريخ الشراء (سنة-شهر-يوم، بيتكتب في يوم / شهر / سنة)", paid: "إجمالي ما دفعته" };
const _TARGET = { grams: "walGramsIn", paid: "walPaidIn", purchaseDate: "walDD" };
const ENGINE = new URL("../vendor/tesseract/", import.meta.url).href;
const OCR_SUGGESTIONS = false;
let objectUrl = null, review = null, busy = false, lastNote = "", curFile = null, curParsed = null, session = null;
const MAX_B64 = 700000; // one Firestore field must stay well under 1 MiB

async function ocrFile(file) {
  const T = await import(ENGINE + "tesseract.esm.min.js");
  const w = await (T.createWorker || T.default.createWorker)(["ara", "eng"], 1, {
    workerPath: ENGINE + "worker.min.js", corePath: ENGINE, langPath: ENGINE + "lang", gzip: false, workerBlobURL: false,
  });
  try {
    // Big phone photos read worse than a mid-size copy of the same photo (text far above ~30 px tall confuses the reader), so read a downscaled copy.
    let src = file;
    try { const bm = await createImageBitmap(file), k = Math.min(1, 1200 / Math.max(bm.width, bm.height));
      if (k < 1) { const c = document.createElement("canvas"); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height); src = await new Promise((r) => c.toBlob(r, "image/png")) || file; } } catch (_) { src = file; }
    const r = await w.recognize(src, {}, { text: true, blocks: true });
    const words = (r.data.blocks || []).flatMap((b) => b.paragraphs).flatMap((p) => p.lines).flatMap((l) => l.words).filter((x) => /\d/.test(x.text));
    return { text: r.data.text || "", minDigitConfidence: words.length ? Math.min(...words.map((x) => x.confidence)) : 0 };
  } finally { await w.terminate(); }
}

function gate(on) { const g = $("walGate"); if (!g) return; g.hidden = !on; if (!on) { document.querySelectorAll("input[name=walAtt]").forEach((x) => { x.checked = false; }); } }
function drop() { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } review = null; curFile = null; curParsed = null; session = null; gate(false); $("invBody").innerHTML = ""; $("invPanel").hidden = true; $("invFile").value = ""; }
function msg(t, kind) { const m = $("invMsg"); m.textContent = t || ""; m.className = "x-msg" + (kind ? " " + kind : ""); }

function render() {
  const body = $("invBody"); body.innerHTML = "";
  const img = document.createElement("img"); img.src = objectUrl; img.alt = "صورة الفاتورة"; img.id = "invImg"; img.style.cssText = "width:100%;max-height:46vh;object-fit:contain;border-radius:12px;background:#0001;cursor:zoom-in";
  img.onclick = () => { const z = img.style.maxHeight === "none"; img.style.maxHeight = z ? "46vh" : "none"; img.style.cursor = z ? "zoom-in" : "zoom-out"; };
  body.append(img);
  const note = document.createElement("p"); note.className = "x-note"; note.textContent = "اكتب القيم من الصورة بنفسك في النموذج تحت، وراجعها قبل الحفظ. الصورة بتفضل على جهازك لحد ما تختار ترفقها.";
  body.append(note);
  const done = document.createElement("button"); done.type = "button"; done.className = "x-btn ghost"; done.textContent = "إغلاق وحذف الصورة"; done.onclick = () => { drop(); msg(""); };
  body.append(done);
}

async function onPick() {
  const file = $("invFile").files && $("invFile").files[0]; if (!file || busy) return;
  if (!/^image\//.test(file.type)) return msg("اختر صورة.", "err");
  drop(); busy = true; if (OCR_SUGGESTIONS) msg("بقرأ الصورة على جهازك، ممكن ياخد وقت…");
  objectUrl = URL.createObjectURL(file); $("invPanel").hidden = false; curFile = file; session = { id: null, saved: null }; gate(true);
  let parsed = null;
  if (!OCR_SUGGESTIONS) msg("الصورة جاهزة للمراجعة. اكتب القيم من الصورة بنفسك.");
  else try { const o = await ocrFile(file); parsed = parseInvoice(o.text, { minDigitConfidence: o.minDigitConfidence }); lastNote = parsed.suppressed ? parsed.karat.note : ""; msg(parsed.suppressed ? lastNote + ". اكتب القيم من الصورة بنفسك." : "القراءة خلصت. راجع كل قيمة بالصورة.", parsed.suppressed ? "err" : "ok"); }
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
  addEventListener("pagehide", () => { if (objectUrl) drop(); });
  window.DHB_INVOICE = {
    active: () => !!objectUrl && !!curFile,
    session: () => session,
    prepareArchive,
    // After a piece was saved from this photo: keep the photo for another piece from the same invoice, clear what was confirmed.
    afterSave() { if (!objectUrl) return; drop(); msg("تمت الإضافة. اتقفلت الصورة من على الصفحة."); },
    close() { drop(); msg(""); },
  };
}
init();
