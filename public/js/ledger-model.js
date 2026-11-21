/* Ledger arithmetic for pieces with optional fee, stones and resale details. Pure functions, no DOM, no network.
 * Rules this file enforces:
 *  - Unknown stays unknown: a missing fee, an unset stones choice or an unknown gold weight never becomes zero or a guess.
 *  - The paid total is authoritative and is never split or reallocated.
 *  - `additions` on an old record is kept exactly as saved and is never read as a stones choice or a cost; its presence
 *    makes the gold-only purchase price (comparison A) unavailable for that piece.
 *  - A seller's buy-back promise is a separate scenario, never part of any total. */
(function () {
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const KARATS = [18, 21, 24];

  // Gold weight that resale figures may use. null = not known.
  function netGrams(r) {
    if (!r || !(r.grams > 0)) return null;
    if (r.stones === 'without') return r.grams;
    if (r.stones === 'with') {
      if (r.basis === 'net') return r.grams;
      if (r.basis === 'total' && finite(r.stoneG) && r.stoneG > 0 && r.stoneG < r.grams) return r.grams - r.stoneG;
    }
    return null;
  }
  const feesKnown = r => finite(r.paid) && finite(r.making) && finite(r.tax) && finite(r.stamp);
  const hasLegacyAdditions = r => finite(r.additions) && r.additions > 0;

  // Gold-only purchase value from recorded fees. Only for pieces without stones, all three fees recorded, no unexplained legacy amount.
  function goldPart(r) {
    if (!r || r.stones !== 'without' || !feesKnown(r) || hasLegacyAdditions(r)) return null;
    const g = r.paid - r.making - r.tax - r.stamp;
    return g > 0 ? g : null;
  }
  function whyNoA(r) {
    if (!finite(r.paid)) return 'no-price';
    if (r.stones === undefined) return 'stones-unset';
    if (r.stones === 'with') return 'stones-cost-unknown';
    if (hasLegacyAdditions(r)) return 'legacy-additions';
    if (!feesKnown(r)) return 'fees-missing';
    return 'non-positive-gold';
  }
  // prices: { 21: { buy, sell }, ... } for today (caller supplies the live board).
  function valuation(r, prices) {
    const p = prices && prices[r.karat];
    const net = netGrams(r), gold = goldPart(r);
    const out = { net, A: null, B: null, whyNoA: null, whyNoB: null, promise: null };
    if (!p) return Object.assign(out, { whyNoA: 'no-market-price', whyNoB: 'no-market-price' });
    if (gold !== null && net !== null) {
      const perGram = gold / net;
      out.A = { perGram, percent: (p.sell - perGram) / perGram * 100 };
    } else out.whyNoA = whyNoA(r);
    if (finite(r.paid) && r.paid > 0 && net !== null) {
      const value = net * p.buy;
      out.B = { value, diff: value - r.paid, percent: (value - r.paid) / r.paid * 100 };
    } else out.whyNoB = !finite(r.paid) ? 'no-price' : r.stones === undefined ? 'stones-unset' : 'gold-weight-unknown';
    // Separate, never included in totals.
    if (r.stones === 'with' && r.promise === 'full' && finite(r.paid)) out.promise = { value: r.grams * p.buy, paid: r.paid, guaranteed: false };
    return out;
  }
  // Totals: the difference is computed only on pieces whose resale weight is known, against the paid amount of those same pieces.
  function aggregate(recs, prices) {
    const list = Array.isArray(recs) ? recs : [];
    const priced = list.filter(r => finite(r.paid));
    const covered = priced.filter(r => netGrams(r) !== null && prices && prices[r.karat]);
    const paidAll = priced.reduce((s, r) => s + r.paid, 0);
    const paidCovered = covered.reduce((s, r) => s + r.paid, 0);
    const now = covered.reduce((s, r) => s + netGrams(r) * prices[r.karat].buy, 0);
    return {
      count: list.length, grams: Math.round(list.reduce((s, r) => s + (r.grams || 0), 0) * 1000) / 1000,
      paidAll, paidCovered, now, diff: covered.length ? now - paidCovered : null, percent: paidCovered > 0 ? (now - paidCovered) / paidCovered * 100 : null,
      approx: list.some(r => finite(r.grams) && Math.abs(r.grams * 1000 - Math.round(r.grams * 1000)) > 1e-6),
      covered: covered.length, unpriced: list.length - priced.length, noGoldWeight: priced.length - covered.length,
      partial: covered.length < list.length,
    };
  }

  // ---- record building and editing (record shape extends the existing {id,label,type,karat,grams,purchaseDate,paid,purpose}) ----
  // Strict number reading for typed fields. Arabic-Indic and Persian digits, Arabic decimal and thousands marks are accepted.
  // Letters, exponents, hex, spaces inside the number and unclear separators are errors, never a guessed value.
  // kind 'grams': one separator is the decimal mark (3,125 and 3.125 and ٣٫١٢٥ are 3 g 125 mg) and at most 3 decimals (milligram) are allowed.
  // kind 'money': a comma followed by exactly 3 digits after 1 to 3 digits is a thousands mark (46,000 is 46000); otherwise a decimal mark.
  function parseNumber(v, kind) {
    if (v === undefined || v === null) return { blank: true };
    let t = String(v).replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, '');
    if (t === '') return { blank: true };
    t = t.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[\u06f0-\u06f9]/g, d => String(d.charCodeAt(0) - 0x6f0))
      .replace(/\u066b/g, '.').replace(/[\u066c\u060c]/g, ',');
    if (!/^[0-9.,]+$/.test(t) || !/[0-9]/.test(t)) return { error: 'format' };
    const commas = (t.match(/,/g) || []).length, dots = (t.match(/\./g) || []).length;
    let intPart, frac = '';
    if (commas && dots) {
      const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',', th = dec === '.' ? ',' : '.';
      const parts = t.split(dec); if (parts.length !== 2 || !parts[1]) return { error: 'format' };
      if (!new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$').test(parts[0])) return { error: 'format' };
      intPart = parts[0].split(th).join(''); frac = parts[1];
      if (!/^\d+$/.test(frac)) return { error: 'format' };
    } else if (dots > 1) return { error: 'format' };
    else if (dots === 1 || commas === 1) {
      const sep = dots ? '.' : ',', parts = t.split(sep);
      if (!/^\d*$/.test(parts[0]) || !/^\d+$/.test(parts[1]) ) return { error: 'format' };
      if (kind !== 'grams' && sep === '.' && parts[1].length === 3 && /^[1-9]\d{0,2}$/.test(parts[0])) return { error: 'ambiguous' };
      if (kind !== 'grams' && sep === ',' && parts[1].length === 3 && /^[1-9]\d{0,2}$/.test(parts[0])) { intPart = parts[0] + parts[1]; }
      else { intPart = parts[0] || '0'; frac = parts[1]; }
    } else if (commas > 1) {
      if (kind === 'grams' || !/^\d{1,3}(,\d{3})+$/.test(t)) return { error: 'format' };
      intPart = t.split(',').join('');
    } else intPart = t;
    if (kind === 'grams' && frac.length > 3) return { error: 'precision' };
    const n = Number(intPart + (frac ? '.' + frac : ''));
    return Number.isFinite(n) ? { value: n } : { error: 'format' };
  }
  const optionalNum = (v, kind) => { const r = parseNumber(v, kind); if (r.blank) return { value: undefined }; if (r.error) return { error: r.error }; return r.value >= 0 ? { value: r.value } : { error: 'format' }; };
  // Reads the optional ledger fields from a form object. Blank = not recorded (undefined), explicit 0 is kept.
  function readDetails(f) {
    const out = {}, errs = [];
    for (const k of ['making', 'tax', 'stamp']) { const r = optionalNum(f[k]); if (r.error) errs.push(k); else if (r.value !== undefined) out[k] = r.value; }
    if (f.stones === 'with' || f.stones === 'without') out.stones = f.stones; else if (f.stones) errs.push('stones');
    if (out.stones === 'with') {
      if (f.basis === 'total' || f.basis === 'net') out.basis = f.basis; else if (f.basis) errs.push('basis');
      if (out.basis === 'total') { const r = optionalNum(f.stoneG, 'grams'); if (r.error || r.value === 0) errs.push('stoneG'); else if (r.value !== undefined) out.stoneG = r.value; }
      if (f.promise === 'full') out.promise = 'full'; else if (f.promise) errs.push('promise');
    }
    return errs.length ? { error: errs } : { details: out };
  }
  const DETAIL_KEYS = ['stones', 'basis', 'stoneG', 'promise', 'making', 'tax', 'stamp'];
  // Edit one record. Changes only the keys this screen owns; every other field (including unknown and legacy ones) is copied untouched.
  // Returns {items, ok}. On any validation problem the original array is returned unchanged.
  function editItem(existing, id, form) {
    const list = Array.isArray(existing) ? existing : [];
    const i = list.findIndex(x => x && x.id === id);
    if (i < 0) return { items: list, ok: false, error: ['missing'] };
    const g = optionalNum(form.grams, 'grams'), paid = optionalNum(form.paid);
    if (g.error || !(g.value > 0)) return { items: list, ok: false, error: ['grams'] };
    if (paid.error) return { items: list, ok: false, error: ['paid'] };
    const d = readDetails(form);
    if (d.error) return { items: list, ok: false, error: d.error };
    if (d.details.stoneG !== undefined && d.details.stoneG >= g.value) return { items: list, ok: false, error: ['stoneG'] };
    const next = Object.assign({}, list[i], { grams: g.value });
    if (paid.value === undefined) delete next.paid; else next.paid = paid.value;
    DETAIL_KEYS.forEach(k => { delete next[k]; });
    Object.assign(next, d.details);
    return { items: list.slice(0, i).concat(next, list.slice(i + 1)), ok: true };
  }
  // Delete one record only. Neighbours (including others from the same invoice) are untouched.
  const deleteItem = (existing, id) => (Array.isArray(existing) ? existing : []).filter(x => x && x.id !== id);

  // d/m/y inputs -> 'YYYY-MM-DD' (stored format) or null when it is not a real date.
  function parseDMY(d, m, y) {
    const dd = optionalNum(d).value, mm = optionalNum(m).value, yy = optionalNum(y).value;
    if (![dd, mm, yy].every(Number.isInteger) || yy < 1900 || yy > 2200) return null;
    const t = new Date(Date.UTC(yy, mm - 1, dd));
    if (t.getUTCFullYear() !== yy || t.getUTCMonth() !== mm - 1 || t.getUTCDate() !== dd) return null;
    return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  const dmy = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '');
  // Group by purchase date and year for the ledger view. Rows without a valid date go last, un-grouped by year.
  function group(recs) {
    const years = {};
    (Array.isArray(recs) ? recs : []).forEach(r => { const d = /^\d{4}-\d{2}-\d{2}$/.test(r.purchaseDate || '') ? r.purchaseDate : 'unknown', y = d === 'unknown' ? 'unknown' : d.slice(0, 4); ((years[y] ||= {})[d] ||= []).push(r); });
    return Object.keys(years).sort().map(y => ({ year: y, dates: Object.keys(years[y]).sort().map(d => ({ date: d, rows: years[y][d] })) }));
  }
  // True when the saved row is still exactly what the screen showed when the user started (key order does not matter).
  // Used so an edit or delete made from an older view never silently replaces or removes a row that changed meanwhile.
  function sameRow(a, b) {
    const norm = v => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { if (v[k] !== undefined) o[k] = norm(v[k]); return o; }, {}) : v);
    return !!a && !!b && JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  }
  const CHANGED_AR = 'القطعة دي اتغيّرت من مكان تاني بعد ما فتحتها. ما اتحفظش أي حاجة. حدّث الصفحة وراجع القيم وجرّب تاني.';
  const GONE_AR = 'القطعة دي اتحذفت من مكان تاني. ما اتحفظش أي تعديل.';
  const api = { parseNumber, sameRow, CHANGED_AR, GONE_AR, parseDMY, dmy, group, netGrams, goldPart, valuation, aggregate, readDetails, editItem, deleteItem, feesKnown, hasLegacyAdditions, KARATS };
  if (typeof module !== 'undefined') module.exports = api; else window.DHB_LEDGER = api;
})();
