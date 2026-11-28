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
    // Market value needs the net resale weight, never the price paid. Gain/loss needs a price paid above zero: with none it stays unknown.
    if (net !== null) {
      const value = net * p.buy, pnl = finite(r.paid) && r.paid > 0;
      out.B = { value, diff: pnl ? value - r.paid : null, percent: pnl ? (value - r.paid) / r.paid * 100 : null };
    } else out.whyNoB = r.stones === undefined ? 'stones-unset' : 'gold-weight-unknown';
    // Separate, never included in totals.
    if (r.stones === 'with' && r.promise === 'full' && finite(r.paid)) out.promise = { value: r.grams * p.buy, paid: r.paid, guaranteed: false };
    return out;
  }
  // Totals. `now` is the market value of every piece whose net resale weight and market price are known; the price paid is not needed for it.
  // Gain/loss (`diff`, `percent`) is computed only on the narrower set of pieces that have BOTH a value and a price paid above zero, against the paid amount of those same pieces.
  function aggregate(recs, prices) {
    const list = Array.isArray(recs) ? recs : [];
    const valued = list.filter(r => netGrams(r) !== null && prices && prices[r.karat]);
    const matched = valued.filter(r => finite(r.paid) && r.paid > 0);
    const priced = list.filter(r => finite(r.paid));
    const paidAll = priced.reduce((s, r) => s + r.paid, 0);
    const paidCovered = matched.reduce((s, r) => s + r.paid, 0);
    const now = valued.reduce((s, r) => s + netGrams(r) * prices[r.karat].buy, 0);
    const nowMatched = matched.reduce((s, r) => s + netGrams(r) * prices[r.karat].buy, 0);
    const netKnown = list.filter(r => netGrams(r) !== null);
    return {
      count: list.length, grams: Math.round(list.reduce((s, r) => s + (r.grams || 0), 0) * 1000) / 1000,
      netGrams: Math.round(netKnown.reduce((s, r) => s + netGrams(r), 0) * 1000) / 1000, netCount: netKnown.length,
      paidAll, paidCovered, now, diff: matched.length ? nowMatched - paidCovered : null, percent: paidCovered > 0 ? (nowMatched - paidCovered) / paidCovered * 100 : null,
      approx: list.some(r => finite(r.grams) && Math.abs(r.grams * 1000 - Math.round(r.grams * 1000)) > 1e-6),
      valued: valued.length, covered: matched.length, pricedCount: priced.length, unpriced: list.length - priced.length, noGoldWeight: list.length - valued.length,
      partial: valued.length < list.length,
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

  // ---- invoices: several lines bought together, quantity, weight entry, invoice-level tax (all pure) ----
  // Money is compared in whole piastres (integers) so 0.1 + 0.2 style drift can never show as a difference.
  const piastres = v => Math.round(v * 100);
  const QTY_MAX = 999;
  // Quantity: whole number 1..999. Blank means 1. Anything else is an error, never rounded.
  function readQty(v) {
    const t = v === undefined || v === null ? '' : String(v).trim();
    if (t === '') return { value: 1 };
    const r = parseNumber(t, 'money');
    if (r.error || r.blank || !Number.isInteger(r.value) || /[.,]/.test(t.replace(/[\u066b\u066c\u060c]/g, '.')) || r.value < 1 || r.value > QTY_MAX) return { error: 'qty' };
    return { value: r.value };
  }
  // Weight as two typed parts: whole grams and the digits after the point (up to 3, leading zeros kept: 6 and 028 is 6.028 g). Result in integer milligrams.
  function composeWeight(whole, frac) {
    const w = String(whole === undefined || whole === null ? '' : whole).trim(), f = String(frac === undefined || frac === null ? '' : frac).trim();
    const dig = t => t.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[\u06f0-\u06f9]/g, d => String(d.charCodeAt(0) - 0x6f0));
    const W = dig(w), F = dig(f);
    if (W === '' && F === '') return { blank: true };
    if (!/^\d{0,5}$/.test(W) || !/^\d{0,3}$/.test(F)) return { error: 'format' };
    const mg = (W === '' ? 0 : Number(W)) * 1000 + (F === '' ? 0 : Number(F.padEnd(3, '0')));
    return mg > 0 ? { mg } : { error: 'zero' };
  }
  const gramsOfMg = mg => mg / 1000; // exact for every integer milligram value that fits, e.g. 30000 -> 30, 6280 -> 6.28
  // Total weight of a line with q identical pieces. Integer milligrams, no float multiplication.
  const totalMg = (unitMg, q) => unitMg * q;
  // Product sizes come from the published product catalog. Bars are 24k and gold coins are 21k in that catalog.
  // The bundled snapshot is used only when the live catalog cannot be read, and it is shown with its date.
  const CATALOG_SNAPSHOT = { asOf: '2026-11-21', bars: [1, 2.5, 5, 10, 20, 50, 100], coins: [{ w: 2, name: 'ربع جنيه' }, { w: 4, name: 'نصف جنيه' }, { w: 8, name: 'جنيه' }] };
  // Sizes from a catalog array. Returns null unless it holds at least one valid bar. Only 24k bars and 21k coins are accepted.
  function sizesFromCatalog(list) {
    if (!Array.isArray(list)) return null;
    const ok = c => c && Number.isFinite(c.weight) && c.weight > 0 && c.weight <= 1000;
    const bars = list.filter(c => ok(c) && c.kind === 'bars' && c.karat === 24).map(c => c.weight).sort((a, b) => a - b);
    const coins = list.filter(c => ok(c) && /^(quarter|half|pound)$/.test(c.kind) && c.karat === 21).map(c => ({ w: c.weight, name: c.name })).sort((a, b) => a.w - b.w);
    return bars.length ? { bars: [...new Set(bars)], coins } : null;
  }
  // Invoice-level tax. mode: 'unknown' | 'none' | 'has'. With 'has', two of (subtotal, vat, total) give the third.
  // Inputs are numbers in pounds or undefined. Returns piastres, which of the three were calculated, and a mismatch flag when all three are given and disagree.
  function invoiceFigures(mode, sub, vat, tot) {
    if (mode !== 'has') return { mode, calc: null };
    const a = [sub, vat, tot].map(x => (Number.isFinite(x) ? piastres(x) : undefined));
    const given = a.filter(x => x !== undefined).length;
    const out = { mode, sub: a[0], vat: a[1], total: a[2], calc: null, mismatch: false };
    if (given === 2) {
      if (a[2] === undefined) { out.total = a[0] + a[1]; out.calc = 'total'; }
      else if (a[1] === undefined) { out.vat = a[2] - a[0]; out.calc = 'vat'; }
      else { out.sub = a[2] - a[1]; out.calc = 'sub'; }
      if (out.calc && [out.sub, out.vat, out.total].some(x => x < 0)) { out.calc = null; out.sub = a[0]; out.vat = a[1]; out.total = a[2]; out.negative = true; }
    } else if (given === 3) out.mismatch = a[0] + a[1] !== a[2];
    return out;
  }
  // Compare the invoice total with the sum of the lines' paid amounts. The difference is shown, never split between lines.
  // lines: [{paid}] paid may be undefined (unknown) -> comparison unavailable.
  function reconcile(total, lines) {
    if (!Number.isFinite(total)) return { state: 'no-total' };
    if (!lines.length || lines.some(l => !Number.isFinite(l.paid))) return { state: 'incomplete' };
    const diff = piastres(total) - lines.reduce((s, l) => s + piastres(l.paid), 0);
    return { state: diff === 0 ? 'match' : 'diff', diff: diff / 100 };
  }
  // Build the stored rows for one invoice from form values. Nothing is saved here.
  // inv: {id, date, mode, sub, vat, total} ; lines: [{id, type, karat, qty, whole, frac, paid, making, makingNone, stamp, stampNone, stones, purpose, note}]
  // making/stamp are line totals for all q pieces and a breakdown INSIDE paid. Blank = not recorded (key absent); "بدون" = explicit 0.
  function buildInvoice(inv, lines) {
    if (!Array.isArray(lines) || !lines.length) return { error: ['lines'] };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(inv.date || '') ? inv.date : null; if (!date) return { error: ['date'] };
    if (!['unknown', 'none', 'has'].includes(inv.mode || 'unknown')) return { error: ['mode'] };
    const rows = [], errs = [];
    lines.forEach((l, i) => {
      const q = readQty(l.qty), w = composeWeight(l.whole, l.frac), paid = optionalNum(l.paid, 'money');
      if (q.error) errs.push('qty:' + i); if (w.error || w.blank) errs.push('weight:' + i);
      if (paid.error || paid.value === undefined) errs.push('paid:' + i);
      if (!['bar', 'coin', 'jewelry', 'scrap'].includes(l.type)) errs.push('type:' + i);
      if (!KARATS.includes(Number(l.karat))) errs.push('karat:' + i);
      if (l.stones !== 'with' && l.stones !== 'without') errs.push('stones:' + i);
      if ((l.type === 'jewelry' || l.purpose) && !['adornment', 'saving'].includes(l.purpose)) errs.push('purpose:' + i);
      const fee = (k, none) => { if (none) return { value: 0 }; const r = optionalNum(l[k], 'money'); if (r.error) errs.push(k + ':' + i); return r; };
      const mk = fee('making', l.makingNone), st = fee('stamp', l.stampNone);
      if (errs.some(e => e.endsWith(':' + i))) return;
      const total = totalMg(w.mg, q.value);
      const rec = { id: String(l.id), label: String(l.note || '').slice(0, 40), type: l.type, karat: Number(l.karat), grams: gramsOfMg(total), purchaseDate: date, paid: paid.value, stones: l.stones, invoiceId: String(inv.id) };
      if (q.value > 1) { rec.qty = q.value; rec.unitGrams = gramsOfMg(w.mg); }
      if (['adornment', 'saving'].includes(l.purpose)) rec.purpose = l.purpose;
      if (l.stones === 'with') {
        const d = readDetails({ stones: 'with', basis: l.basis, stoneG: l.stoneG, promise: l.promise });
        if (d.error) errs.push('stones-details:' + i);
        else { ['basis', 'stoneG', 'promise'].forEach(k => { if (d.details[k] !== undefined) rec[k] = d.details[k]; }); if (rec.stoneG !== undefined && rec.stoneG >= rec.grams) errs.push('stoneG:' + i); }
      }
      if (errs.some(e => e.endsWith(':' + i))) return;
      if (mk.value !== undefined) rec.making = mk.value;
      if (st.value !== undefined) rec.stamp = st.value;
      rows.push(rec);
    });
    if (errs.length) return { error: errs };
    const m = buildInvoiceMeta(inv); if (m.error) return m;
    return { rows, invoice: m.invoice };
  }
  // Invoice-level record only: id, tax mode and the figures that were given or calculated (in pounds). Unknown stores no figures.
  function buildInvoiceMeta(inv) {
    const mode = inv.mode || 'unknown'; if (!['unknown', 'none', 'has'].includes(mode)) return { error: ['mode'] };
    const raw = ['sub', 'vat', 'total'].map(k => optionalNum(inv[k], 'money'));
    if (raw.some(r => r.error)) return { error: ['figures'] };
    const f = invoiceFigures(mode, raw[0].value, raw[1].value, raw[2].value);
    if (f.negative) return { error: ['figures'] };
    const meta = { id: String(inv.id), vatMode: mode };
    if (f.mode === 'has') { ['sub:subtotal', 'vat:vat', 'total:total'].forEach(p => { const [k, n] = p.split(':'); if (f[k] !== undefined) meta[n] = f[k] / 100; }); }
    return { invoice: meta };
  }
  // Change one invoice: replace its record (or add it) and set the purchase date on its rows only. Nothing else on any row changes.
  function applyInvoiceEdit(existingItems, existingInvoices, meta, date) {
    const items = (Array.isArray(existingItems) ? existingItems : []).map(r => (r && r.invoiceId === meta.id && r.purchaseDate !== date ? Object.assign({}, r, { purchaseDate: date }) : r));
    const invs = Array.isArray(existingInvoices) ? existingInvoices : [];
    return { items, invoices: invs.some(x => x && x.id === meta.id) ? invs.map(x => (x && x.id === meta.id ? meta : x)) : invs.concat(meta) };
  }
  // After a row is removed: an invoice record with no rows left is removed too, so no orphan figures stay behind.
  const pruneInvoices = (items, invoices) => { const used = new Set((Array.isArray(items) ? items : []).map(r => r && r.invoiceId).filter(Boolean)); return (Array.isArray(invoices) ? invoices : []).filter(x => x && used.has(x.id)); };
  // Append rows and the invoice record in one list change. Same ids already there are kept as they are (retry safe).
  // The doc keeps its list under `items`; invoice records live next to it under `invoices` and are handed back separately so the writer keeps both.
  function mergeInvoice(existingItems, existingInvoices, built) {
    const items = Array.isArray(existingItems) ? existingItems : [], invs = Array.isArray(existingInvoices) ? existingInvoices : [];
    const have = new Set(items.map(x => x && x.id));
    const add = built.rows.filter(r => !have.has(r.id));
    return { items: items.concat(add), invoices: invs.some(x => x && x.id === built.invoice.id) ? invs : invs.concat(built.invoice), added: add.length };
  }
  // Display helpers for rows (old rows have no qty and read exactly as before).
  const qtyOf = r => (Number.isInteger(r && r.qty) && r.qty > 1 ? r.qty : 1);
  const unitGramsOf = r => (qtyOf(r) > 1 && finite(r.unitGrams) ? r.unitGrams : (r && r.grams));
  const api = { readQty, composeWeight, gramsOfMg, totalMg, CATALOG_SNAPSHOT, sizesFromCatalog, invoiceFigures, reconcile, buildInvoice, buildInvoiceMeta, applyInvoiceEdit, pruneInvoices, mergeInvoice, qtyOf, unitGramsOf, piastres, parseNumber, sameRow, CHANGED_AR, GONE_AR, parseDMY, dmy, group, netGrams, goldPart, valuation, aggregate, readDetails, editItem, deleteItem, feesKnown, hasLegacyAdditions, KARATS };
  if (typeof module !== 'undefined') module.exports = api; else window.DHB_LEDGER = api;
})();
