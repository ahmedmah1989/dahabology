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
  if (field === "grams" || field === "paid") {
    // One strict reader for every number (same as the wallet form). If it is not loaded, fail closed rather than guess a separator.
    const PN = globalThis.DHB_LEDGER && globalThis.DHB_LEDGER.parseNumber;
    const r = PN ? PN(raw, field === "grams" ? "grams" : "money") : { error: "format" };
    if (field === "grams") {
      if (r.error === "precision") return { ok: false, error: "الوزن بالجرام لحد ٣ أرقام بعد العلامة (مليجرام). مثال: \u20663.125\u2069 يعني \u20663\u2069 جرام و\u2066125\u2069 مليجرام." };
      return r.value > 0 && r.value <= 2000 ? { ok: true, value: r.value } : { ok: false, error: "اكتب الوزن بالجرام بأرقام صحيحة." };
    }
    if (r.error === "ambiguous") return { ok: false, error: "المبلغ غير واضح. اكتبه من غير فاصلة آلاف، مثال: 46000 أو 46000.5" };
    return Number.isFinite(r.value) && r.value >= 0 && Math.abs(r.value * 100 - Math.round(r.value * 100)) < 1e-6 ? { ok: true, value: r.value } : { ok: false, error: "اكتب المبلغ المدفوع بأرقام صحيحة." };
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
