// Review state for an invoice photo. OCR values are untrusted suggestions: the owner must type or tap a value,
// then confirm it against the photo. Only confirmed values leave this module. Nothing here saves or uploads anything.
export const FIELDS = ["karat", "grams", "purchaseDate", "paid"];
const WALLET_KARATS = [18, 21, 24]; // the wallet form offers these three only

export function validate(field, raw, today = new Date()) {
  // People type Arabic-Indic digits on an Arabic keyboard; read them as the numbers they are.
  const s = String(raw ?? "").trim().replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/٫/g, ".").replace(/٬/g, ",");
  if (!s) return { ok: false, error: "اكتب القيمة أو اختر المقترح أولاً." };
  if (field === "karat") {
    const n = Number(s);
    return WALLET_KARATS.includes(n) ? { ok: true, value: n } : { ok: false, error: "اختر 18 أو 21 أو 24." };
  }
  if (field === "grams") {
    const n = Number(s.replace(",", "."));
    return n > 0 && n <= 2000 && /^\d+(\.\d{1,3})?$/.test(s.replace(",", ".")) ? { ok: true, value: n } : { ok: false, error: "اكتب الوزن بالجرام بأرقام صحيحة." };
  }
  if (field === "paid") {
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 && /^\d+(\.\d{1,2})?$/.test(s.replace(/,/g, "")) ? { ok: true, value: n } : { ok: false, error: "اكتب المبلغ المدفوع بأرقام صحيحة." };
  }
  if (field === "purchaseDate") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: "اكتب التاريخ بصيغة سنة-شهر-يوم." };
    const d = new Date(s + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { ok: false, error: "التاريخ غير صحيح." };
    if (s > today.toISOString().slice(0, 10)) return { ok: false, error: "التاريخ في المستقبل." };
    return { ok: true, value: s };
  }
  return { ok: false, error: "حقل غير معروف." };
}

// parsed: result of parseInvoice, or null when OCR failed or was skipped (manual entry only).
export function createReview(parsed, opts = {}) {
  const today = opts.today || new Date();
  const rows = {};
  for (const f of FIELDS) {
    const p = parsed && parsed[f];
    const cand = p ? (p.status === "ok" ? [p.value] : (p.candidates || [])) : [];
    rows[f] = { suggestions: cand.map(String), note: p ? p.note : "", input: "", confirmed: null, error: "" };
    if (parsed && parsed.suppressed) rows[f].suggestions = [];
  }
  const api = {
    rows,
    suggest(f, i = 0) { const r = rows[f]; if (r.suggestions[i] != null) { r.input = r.suggestions[i]; r.confirmed = null; r.error = ""; } return r.input; },
    setInput(f, v) { const r = rows[f]; r.input = String(v ?? ""); r.confirmed = null; r.error = ""; },
    confirm(f) {
      const r = rows[f], v = validate(f, r.input, today);
      if (!v.ok) { r.confirmed = null; r.error = v.error; return false; }
      r.confirmed = v.value; r.error = ""; return true;
    },
    unconfirm(f) { rows[f].confirmed = null; },
    confirmedValues() { const o = {}; for (const f of FIELDS) if (rows[f].confirmed !== null) o[f] = rows[f].confirmed; return o; },
    allConfirmed() { return FIELDS.every((f) => rows[f].confirmed !== null); },
  };
  return api;
}
