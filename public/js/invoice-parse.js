// Turns OCR text from a gold invoice into SUGGESTED wallet fields. Nothing here saves anything.
// Rules: a value is filled only when it has explicit evidence (unit, label, valid range) and no competing reading.
// Everything else is left empty, with the reason, so the owner types or confirms it. Every field always needs owner confirmation,
// because OCR can misread a digit and still produce a plausible number.
const KARATS = [24, 22, 21, 18, 14, 12, 10, 9];
const AR = "٠١٢٣٤٥٦٧٨٩", FA = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(s) {
  return String(s || "")
    .replace(/[٠-٩]/g, (c) => AR.indexOf(c))
    .replace(/[۰-۹]/g, (c) => FA.indexOf(c))
    .replace(/٫/g, ".").replace(/٬/g, ",");
}

const field = (value, status, note, extra) => ({ value, status, note: note || "", confirm: true, ...(extra || {}) });
const missing = (note) => field(null, "missing", note);
const unique = (arr) => [...new Set(arr)];

function karat(text) {
  const found = [];
  const re = /(?:عيار|قيراط|karat|\bk(?:t)?\s*)\s*[:\-]?\s*(\d{1,2})(?!\d)|(?<!\d)(\d{1,2})\s*(?:k(?:t|arat)?\b|ك(?![\p{L}])|قيراط|عيار)/giu;
  let m;
  while ((m = re.exec(text))) found.push(Number(m[1] || m[2]));
  const valid = unique(found.filter((k) => KARATS.includes(k)));
  if (valid.length === 1) return field(valid[0], "ok");
  if (valid.length > 1) return field(null, "check", "أكثر من عيار في الفاتورة", { candidates: valid });
  if (found.length) return field(null, "check", "العيار المقروء غير معتاد", { candidates: unique(found) });
  return missing("لم يظهر العيار بوضوح");
}

function grams(text) {
  const out = [];
  const unit = "(?:g|gm|gms|gr|grams?|جم|جرام|غ|غرام)(?![\\p{L}\\d])";
  const re = new RegExp("(?<![\\d.,])(\\d{1,4}(?:[.,]\\d{1,3})?)\\s*" + unit, "giu");
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  const vals = [];
  for (const raw of out) {
    const dec = raw.includes(",") && !raw.includes(".") ? (/,\d{3}$/.test(raw) ? null : raw.replace(",", ".")) : raw;
    if (dec === null) return field(null, "check", "الفاصلة في الوزن غير واضحة", { candidates: [raw] });
    vals.push(Number(dec));
  }
  const u = unique(vals);
  if (u.length > 1) return field(null, "check", "أكثر من وزن في الفاتورة", { candidates: u });
  if (u.length === 1) {
    if (u[0] > 0 && u[0] <= 2000) return field(u[0], "ok");
    return field(null, "check", "الوزن خارج المعقول", { candidates: u });
  }
  if (/(?:الوزن|weight|wt)\s*[:\-]?\s*\S/iu.test(text)) return missing("الوزن ظاهر بدون وحدة واضحة (جم)");
  return missing("لم يظهر الوزن بوضوح");
}

function date(text, today) {
  const cands = [];
  let m;
  const dmy = /(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?!\d)/g;
  while ((m = dmy.exec(text))) cands.push({ y: +m[3], a: +m[1], b: +m[2], iso: false });
  const ymd = /(?<!\d)(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/g;
  while ((m = ymd.exec(text))) cands.push({ y: +m[1], mo: +m[2], d: +m[3], iso: true });
  const t = today instanceof Date ? today : new Date();
  const todayIso = t.toISOString().slice(0, 10);
  const ok = (y, mo, d) => {
    if (y < 1990 || y > t.getUTCFullYear() + 1) return false;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
    return dt.toISOString().slice(0, 10) <= todayIso;
  };
  const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const readings = [];
  for (const c of cands) {
    if (c.iso) { if (ok(c.y, c.mo, c.d)) readings.push([iso(c.y, c.mo, c.d)]); }
    else {
      const r = [];
      if (ok(c.y, c.b, c.a)) r.push(iso(c.y, c.b, c.a)); // day/month/year, the local convention
      if (c.a !== c.b && ok(c.y, c.a, c.b)) r.push(iso(c.y, c.a, c.b));
      if (r.length) readings.push(r);
    }
  }
  if (!readings.length) return missing(cands.length ? "التاريخ المقروء غير معقول" : "لم يظهر التاريخ بوضوح");
  const all = unique(readings.flat());
  if (readings.length === 1 && readings[0].length === 1) return field(readings[0][0], "ok");
  return field(null, "check", readings.length > 1 ? "أكثر من تاريخ في الفاتورة" : "اليوم والشهر ممكن يتقرا بطريقتين", { candidates: all });
}

function paid(text) {
  const label = /(?:الإجمالي|الاجمالي|إجمالي|اجمالي|المجموع|الصافي|صافي|المطلوب|grand\s*total|total|net|amount\s*due)(?!\s*(?:الفرعي|sub))/iu;
  const vals = [];
  for (const line of text.split(/\n/)) {
    if (!label.test(line) || /sub\s*total|المصنعية|making|مصنعية|ضريبة|tax|vat/iu.test(line.replace(label, ""))) continue;
    const after = line.slice(line.search(label));
    const m = after.match(/(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d])/);
    if (m) { if (/^0\d/.test(m[1])) return field(null, "check", "الإجمالي المقروء غير منطقي", { candidates: [m[1]] }); vals.push(Number(m[1].replace(/,/g, ""))); }
  }
  const u = unique(vals);
  if (u.length === 1 && u[0] >= 50) return field(u[0], "ok");
  if (u.length === 1) return field(null, "check", "الإجمالي المقروء صغير جداً، راجعه", { candidates: u });
  if (u.length > 1) return field(null, "check", "أكثر من إجمالي في الفاتورة", { candidates: u });
  return missing("لم يظهر السطر المكتوب عليه الإجمالي بوضوح");
}

export function parseInvoice(rawText, opts = {}) {
  const text = normalizeDigits(rawText);
  return { karat: karat(text), grams: grams(text), purchaseDate: date(text, opts.today), paid: paid(text) };
}

// Wallet record fields the review form may prefill. Only status "ok" values are returned; the owner still confirms each one.
export function prefill(parsed) {
  const out = {};
  if (parsed.karat.status === "ok") out.karat = parsed.karat.value;
  if (parsed.grams.status === "ok") out.grams = parsed.grams.value;
  if (parsed.purchaseDate.status === "ok") out.purchaseDate = parsed.purchaseDate.value;
  if (parsed.paid.status === "ok") out.paid = parsed.paid.value;
  return out;
}
