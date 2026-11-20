/* Dahabology zakat engine: PREPARATION ONLY. Not wired into any page, not published, not a religious ruling.
 * It FAILS CLOSED: there are no default methods. Any unresolved applicability, hawl origin, additions method
 * or asset aggregation returns status 'blocked' with the reasons and NO due date or amount.
 * Dates are 'YYYY-MM-DD' (Gregorian). The hawl is counted in Hijri (Umm al-Qura, a civil calendar). */
(function (root) {
  'use strict';
  const FMT = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const DAY = 86400000, RATE = 0.025, SIGHTING_MARGIN_DAYS = 2;
  const KARAT = { '24': 1, '22': 22 / 24, '21': 21 / 24, '18': 18 / 24 };
  const NISAB = [85, 91.6, 92];     // grams pure gold: ZATCA / Saudi Permanent Committee / Ibn Baz. Caller must choose.

  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return null; const t = Date.UTC(+m[1], +m[2] - 1, +m[3]); const d = new Date(t); return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null; };
  const iso = t => new Date(t).toISOString().slice(0, 10);

  function toHijri(s) {
    const t = parse(s); if (t === null) return null;
    const o = {}; FMT.formatToParts(new Date(t)).forEach(p => { if (p.type === 'year' || p.type === 'month' || p.type === 'day') o[p.type[0]] = +p.value; });
    return o.y ? o : null;
  }
  /** Same Hijri month and day in the following Hijri year. If that day does not exist (e.g. day 30 in a 29-day month)
   *  returns null: no source we found says which day applies, so callers must treat it as unresolved. */
  function hawlEnd(s) {
    const t = parse(s), h = toHijri(s); if (t === null || !h) return null;
    for (let i = 345; i <= 360; i++) { const c = toHijri(iso(t + i * DAY)); if (c.y === h.y + 1 && c.m === h.m && c.d === h.d) return iso(t + i * DAY); }
    return null;
  }

  /**
   * items: [{ id, type:'jewelry'|'bar'|'coin'|'scrap', karat, grams, purchaseDate,
   *   use:'worn'|'unused'            (required for jewelry),
   *   alsoSavings:boolean            (required for worn jewelry),
   *   purposeChangeDate?             (worn jewelry later intended for saving/trade),
   *   fundsSource:'new'|'prior-zakatable'  (required for every lot that counts),
   *   fundsHawlStart?                (required when 'prior-zakatable': date the cash used had completed nisab),
   *   sold?: true }                  (sales are not modeled: blocks)
   * opts: ALL required, no defaults:
   *   asOf, wornView:'exempt'|'zakatable', nisabGrams:85|91.6|92,
   *   additionsMethod:'per-lot'      (only method supported),
   *   otherZakatableAssets:'none-confirmed'  (cash, silver, trade goods: not modeled, so anything else blocks),
   *   goldPricePerGram24?            (optional; money value only)
   */
  function zakat(items, opts) {
    const o = opts || {}, blockers = [];
    const block = m => blockers.push(m);
    const asOf = parse(o.asOf);
    if (asOf === null) block('asOf date is missing');
    if (o.wornView !== 'exempt' && o.wornView !== 'zakatable') block('Method not chosen: ruling on worn jewelry (exempt vs zakatable).');
    if (NISAB.indexOf(o.nisabGrams) < 0) block('Method not chosen: nisab in grams of pure gold (85, 91.6 or 92).');
    if (o.additionsMethod !== 'per-lot') block('Additions method not chosen or unsupported. Only per-lot is supported.');
    if (o.otherZakatableAssets !== 'none-confirmed') block('Aggregation unresolved: cash, silver and trade goods combine with gold for nisab but are not modeled. Confirm none are held, or this cannot be computed.');
    if (!Array.isArray(items) || !items.length) block('No items.');
    if (blockers.length) return { status: 'blocked', blockers };

    const rows = [];
    for (const it of items) {
      const r = { id: it.id, pure: 0, start: null, status: '', note: '' }; rows.push(r);
      const pur = KARAT[it.karat], g = Number(it.grams), pd = parse(it.purchaseDate);
      if (!pur || !(g > 0) || pd === null) { r.status = 'blocked'; block(it.id + ': karat, weight or purchase date missing or invalid'); continue; }
      r.pure = g * pur;
      if (it.sold) { r.status = 'blocked'; block(it.id + ': sold items are not modeled (a sale can interrupt or carry the hawl, and the schools differ)'); continue; }
      if (pd > asOf) { r.status = 'blocked'; block(it.id + ': purchase date is after asOf'); continue; }
      if (['jewelry', 'bar', 'coin', 'scrap', 'broken'].indexOf(it.type) < 0) { r.status = 'blocked'; block(it.id + ': unknown item type'); continue; }
      if (it.type === 'jewelry' && it.use !== 'worn' && it.use !== 'unused') { r.status = 'blocked'; block(it.id + ': jewelry needs an explicit worn/unused answer'); continue; }
      if (it.type !== 'jewelry' && it.use) { r.status = 'blocked'; block(it.id + ': only jewelry can be marked worn/unused'); continue; }
      const worn = it.type === 'jewelry' && it.use === 'worn';
      let counts = true, origin = null;
      if (worn && o.wornView === 'exempt') {
        if (typeof it.alsoSavings !== 'boolean') { r.status = 'blocked'; block(it.id + ': worn jewelry needs an explicit answer whether it was also bought for saving'); continue; }
        if (!it.alsoSavings) {
          counts = false;
          if (it.purposeChangeDate) {
            const cd = parse(it.purposeChangeDate);
            if (cd === null || cd < pd) { r.status = 'blocked'; block(it.id + ': change-of-purpose date invalid or before purchase'); continue; }
            if (cd <= asOf) { counts = true; origin = cd; r.note = 'counts from the declared change of purpose (Ibn Qudama, via islamweb 6237)'; }
          }
          if (!counts) { r.status = 'exempt'; r.note = 'worn jewelry, exempt under the chosen view'; continue; }
        }
      }
      if (counts && origin === null) {
        if (it.fundsSource === 'new') origin = pd;
        else if (it.fundsSource === 'prior-zakatable') {
          const fh = parse(it.fundsHawlStart);
          if (fh === null || fh > pd) { r.status = 'blocked'; block(it.id + ': prior-zakatable funds need the date that cash completed nisab (on or before purchase)'); continue; }
          origin = fh;    // hawl of the money it was bought with (Ibn Qudama via islamqa 324461; the Shafi\'i school restarts instead)
          r.note = 'hawl taken from the cash it was bought with (Hanafi/Maliki/Hanbali; Shafi\'i restarts)';
        } else { r.status = 'blocked'; block(it.id + ': say whether it was bought with new money or with cash that was already zakatable'); continue; }
      }
      r.status = 'counts'; r.origin = iso(origin); r.purchase = iso(pd); r.carried = it.fundsSource === 'prior-zakatable' && r.origin < r.purchase;
    }
    if (blockers.length) return { status: 'blocked', blockers, rows };

    const nisab = o.nisabGrams, counting = rows.filter(r => r.status === 'counts');
    // Nisab is counted on gold held together; a lot's own hawl cannot start before nisab was first reached.
    // Gold actually held is counted from the purchase date (or the declared change of purpose), not from a carried-over cash hawl.
    const held = r => r.carried ? r.purchase : r.origin;
    const byDate = counting.slice().sort((a, b) => held(a) < held(b) ? -1 : 1);
    let cum = 0, nisabDate = null;
    for (const r of byDate) { cum += r.pure; if (cum >= nisab) { nisabDate = held(r); break; } }
    const out = { status: 'computed', rows, nisabGrams: nisab, nisabReachedOn: nisabDate, lots: [], dueLots: [], notYetDue: [], notice: 'Not a religious ruling. Umm al-Qura is a civil calendar; month starts by sighting can differ by a day or two.', method: { wornView: o.wornView, nisabGrams: nisab, additionsMethod: o.additionsMethod, rate: RATE, source: 'islamqa 324461 (Ibn Uthaymeen: purchases during the year keep their own hawl; may be paid together early), islamqa 433680 (hawl from nisab completion)' } };
    if (nisabDate === null) { out.reason = 'zakatable gold has not reached nisab'; return out; }
    out.hijriNisabDate = toHijri(nisabDate);
    let lastYearGate = false;
    for (const r of counting) {
      if (r.carried && r.origin < nisabDate && r.pure < nisab) { block(r.id + ': cash-to-gold carryover combined with nisab being reached later by the gold is not modeled (cash held nisab earlier than the gold did).'); continue; }
      const start = (r.origin < nisabDate && !(r.carried && r.pure >= nisab)) ? nisabDate : r.origin;
      const end = hawlEnd(start);
      if (end === null) { block(r.id + ': the same Hijri day does not exist in the following Hijri year (e.g. day 30). No source settles which day applies.'); continue; }
      const e = parse(end);
      if (Math.abs(asOf - e) <= SIGHTING_MARGIN_DAYS * DAY) { block(r.id + ': asOf is within ' + SIGHTING_MARGIN_DAYS + ' days of the Umm al-Qura hawl end (' + end + '). Month start by sighting could change the answer.'); continue; }
      if (asOf > e + 355 * DAY) { block(r.id + ': a second hawl has passed. Payment history for earlier years is not modeled.'); lastYearGate = true; continue; }
      if (r.carried && e < parse(r.purchase)) { block(r.id + ': the carried cash hawl ended before the gold was bought (zakat on that cash was due first; not modeled).'); continue; }
      const lot = { id: r.id, pure: r.pure, hawlStart: start, hawlEnd: end };
      out.lots.push(lot);
      (e < asOf ? out.dueLots : out.notYetDue).push(lot);
    }
    if (blockers.length) return { status: 'blocked', blockers, rows };
    // Nisab must still be met by the gold held on each due date (sales not modeled, so held = purchased by then).
    for (const lot of out.dueLots) {
      lot.heldOnDue = counting.filter(r => held(r) <= lot.hawlEnd).reduce((s, r) => s + r.pure, 0);
      lot.nisabHeld = lot.heldOnDue >= nisab;
      lot.gramsDue = lot.nisabHeld ? lot.pure * RATE : 0;
    }
    out.gramsDue = out.dueLots.reduce((s, l) => s + l.gramsDue, 0);
    const p = Number(o.goldPricePerGram24);
    if (p > 0) out.amount = out.gramsDue * p;
    return out;
  }


  /**
   * Method "elewa-annual-date": follows the individual-zakat approach taught by Dr. Basem Elewa (sources in the brief):
   * one pooled base (gold + cash and other zakatable assets), 85 g of 24k nisab, 2.5% of the WHOLE base, a fixed personal
   * Hijri zakat date, jewelry judged by purpose at purchase, bars/coins/scrap always zakatable.
   * items: { id, type, karat, grams, purchaseDate, purpose?:'adornment'|'saving' (jewelry, required),
   *          withinCustomary?:boolean (jewelry bought for adornment, required), purposeChangeDate? }
   * opts: { asOf, zakatDate:{m,d<=29}, goldPricePerGram24 (required), otherZakatableNet (required, 0 if none),
   *         nisabReachedOn (required when otherZakatableNet>0) }
   * Still fails closed; it does not decide cash history, debts beyond the one net number, sales, or scholar review.
   */
  const RULE_SOURCES = [
    { rule: 'Pooled base, 2.5% of whole base, fixed Hijri zakat date, no tracking during the year, earlier month if nisab date unsure', source: 'Basem Elewa, Petroli podcast (Baheth 474403)' },
    { rule: 'Nisab 85 g of 24k, Hijri hawl, full ownership', source: 'Basem Elewa, LinkedIn post 2024-09-22' },
    { rule: 'Jewelry: purpose at purchase decides; bars, coins and scrap are always zakatable', source: 'Basem Elewa, LinkedIn post 2026-08-23' },
    { rule: 'Adornment exemption conditions (lawful, present use, customary amount, wearable); broken jewelry zakatable with a new hawl from the break', source: 'Contemporary zakat issues symposium recommendations (al-Zuhayli, Fiqh al-Islami), NOT Elewa' },
    { rule: 'Change of purpose to saving or trade starts the hawl from the intention date', source: 'Dar al-Ifta Egypt fatwa 20631 quoting Ibn Qudama, NOT Elewa' },
    { rule: 'Snapshot on the fixed date: what exists on that date counts, whether it rose or fell during the year; no separate hawl per addition; cash, goods and gold pooled', source: 'Basem Elewa, LinkedIn posts 2025-01-02 and 2024-09-01' },
    { rule: 'Broken jewelry kept for repair: Malik (Muwatta 675) says no zakat, the symposium says zakatable. Not Elewa. Blocked.', source: 'Muwatta of Malik; symposium' },
    { rule: 'Product gate, not fiqh: 2-day sighting margin on the hawl end', source: 'Dahabology' }
  ];
  function zakatElewa(items, opts) {
    const o = opts || {}, blockers = [], block = m => blockers.push(m);
    const asOf = parse(o.asOf), zd = o.zakatDate || {};
    if (asOf === null) block('asOf date is missing');
    if (!(zd.m >= 1 && zd.m <= 12 && zd.d >= 1 && zd.d <= 30)) block('Personal Hijri zakat date missing (month 1-12, day 1-30).');
    const price = Number(o.goldPricePerGram24); if (!(price > 0) || !isFinite(price)) block('Gold price per gram (24k) on the zakat date is required.');
    if (typeof o.otherZakatableNet !== 'number' || !isFinite(o.otherZakatableNet) || o.otherZakatableNet < 0) block('Other zakatable assets (cash etc., net of short-term debts) must be stated, 0 if none.');
    if (o.otherZakatableNet > 0 && parse(o.nisabReachedOn) === null) block('When cash or other assets are included, the date the total reached nisab is required.');
    if (!Array.isArray(items) || (!items.length && !(o.otherZakatableNet > 0))) block('No items.');
    if (blockers.length) return { status: 'blocked', blockers, method: 'elewa-annual-date' };
    const rows = []; let pure = 0; const starts = [];
    for (const it of items) {
      const r = { id: it.id, pure: 0, status: '' }; rows.push(r);
      const k = KARAT[it.karat], g = Number(it.grams), pd = parse(it.purchaseDate);
      if (!k || !(g > 0) || pd === null || pd > asOf) { r.status = 'blocked'; block(it.id + ': karat, weight or purchase date missing or invalid'); continue; }
      if (it.sold) { r.status = 'blocked'; block(it.id + ': sold items are not modeled'); continue; }
      if (['jewelry', 'bar', 'coin', 'scrap', 'broken'].indexOf(it.type) < 0) { r.status = 'blocked'; block(it.id + ': unknown item type'); continue; }
      r.pure = g * k; let start = pd, counts = true;
      if (it.type === 'jewelry') {
        if (it.purpose !== 'adornment' && it.purpose !== 'saving') { r.status = 'blocked'; block(it.id + ': jewelry needs the purpose it was bought for (adornment or saving)'); continue; }
        if (it.purpose === 'adornment') {
          // Exempt only if every condition of the contemporary zakat issues symposium (1st, Cairo) recommendation holds; user attests each.
          const c = it.adornmentChecks || {};
          if (typeof c.lawful !== 'boolean' || typeof c.immediateUse !== 'boolean' || typeof c.customaryAmount !== 'boolean' || typeof c.wearable !== 'boolean') { r.status = 'blocked'; block(it.id + ': adornment jewelry needs answers: lawful use, for present (not far-future) use, customary amount, still wearable'); continue; }
          // Symposium item 2(e): an amount beyond the customary measure is zakatable only for the excess. The excess cannot be computed here, so no result is given.
          if (c.lawful && c.immediateUse && c.wearable && !c.customaryAmount) { r.status = 'blocked'; block(it.id + ': amount beyond the customary measure: the symposium makes only the excess zakatable and the excess is not computed here, no result given'); continue; }
          if (c.lawful && c.immediateUse && c.customaryAmount && c.wearable) {
            counts = false;
            if (it.purposeChangeDate) { const cd = parse(it.purposeChangeDate); if (cd === null || cd < pd) { r.status = 'blocked'; block(it.id + ': change-of-purpose date invalid'); continue; } if (cd <= asOf) { counts = true; start = cd; } }
          } else if (!c.wearable) { r.status = 'blocked'; block(it.id + ': jewelry no longer wearable must be entered as broken jewelry, not adornment'); continue; }
        }
      } else if (it.type === 'broken') {
        // Symposium (not Elewa): broken jewelry usable only after re-melting is zakatable, new hawl from the break. Elewa does not address it.
        const bk = parse(it.brokenOn); if (bk === null || bk < pd || bk > asOf) { r.status = 'blocked'; block(it.id + ': broken jewelry needs the date it broke'); continue; }
        if (it.plan !== 'melt-or-sell') { r.status = 'blocked'; block(it.id + ': broken jewelry kept for repair: Malik (Muwatta 675) says no zakat when the owner intends to repair and wear it, the symposium makes jewelry that needs re-melting zakatable; Elewa gives no ruling for repair, no result given'); continue; }
        start = bk;
      } else if (it.purpose) { r.status = 'blocked'; block(it.id + ': purpose applies to jewelry only'); continue; }
      if (!counts) { r.status = 'exempt'; continue; }
      r.status = 'counts'; r.start = start; pure += r.pure; starts.push({ at: start, pure: r.pure });
    }
    if (blockers.length) return { status: 'blocked', blockers, rows, method: 'elewa-annual-date' };
    const nisabValue = 85 * price, base = pure * price + o.otherZakatableNet;
    // when did the pooled base reach nisab
    let nisabDate = null;
    if (o.otherZakatableNet > 0) nisabDate = iso(parse(o.nisabReachedOn));
    else { let c = 0; for (const x of starts.sort((a, b) => a.at - b.at)) { c += x.pure; if (c >= 85) { nisabDate = iso(x.at); break; } } }
    const out = { status: 'computed', method: 'elewa-annual-date', rows, base, nisabValue, nisabGrams: 85, rate: RATE, nisabReachedOn: nisabDate, due: false, notice: 'Not a fatwa and not reviewed by a qualified scholar. Each rule below is tied to its own source; they are not one scholar\'s single ruling.', ruleSources: RULE_SOURCES };
    if (pure === 0 && o.otherZakatableNet === 0) { out.reason = 'no item counts as zakatable under the answers given (adornment exemption)'; return out; }
    if (base < nisabValue || nisabDate === null) { out.reason = 'zakatable wealth is below nisab on the zakat date'; return out; }
    const first = hawlEnd(nisabDate); if (first === null) return { status: 'blocked', blockers: ['no same Hijri day one year after nisab was reached'], method: out.method };
    // most recent occurrence of the personal zakat date on or before asOf
    let occ = null; for (let i = 0; i <= 360; i++) { const dt = asOf - i * DAY, h = toHijri(iso(dt)); if (h.m === zd.m && h.d === zd.d) { occ = iso(dt); break; } }
    if (occ === null) return { status: 'blocked', blockers: [zd.d === 30 ? 'Hijri day 30 of the zakat month does not exist in the latest year (the month has 29 days). No source found says whether the 29th or the 1st applies, so no result is given.' : 'could not locate the zakat date'], method: out.method };
    if (Math.abs(asOf - parse(occ)) <= SIGHTING_MARGIN_DAYS * DAY && asOf !== parse(occ)) { /* day after/before: still fine, only the hawl end margin matters below */ }
    out.zakatDateOccurrence = occ; out.hawlCompleteOn = first;
    if (Math.abs(parse(occ) - parse(first)) <= SIGHTING_MARGIN_DAYS * DAY || Math.abs(asOf - parse(first)) <= SIGHTING_MARGIN_DAYS * DAY) return { status: 'blocked', blockers: ['the hawl end (' + first + ') is within ' + SIGHTING_MARGIN_DAYS + ' days of the zakat date or asOf; confirm the month start by sighting (product gate)'], method: out.method, rows };
    if (parse(first) > parse(occ)) { out.reason = 'a full Hijri year since nisab had not passed on the latest zakat date (' + occ + ')'; out.firstEligibleAfter = first; return out; }
    // First zakat date after the hawl completed, or a later year? (a Hijri year is about 354 days)
    const isFirst = parse(first) > parse(occ) - 340 * DAY;
    const ey = o.earlierYears;
    if (ey !== 'none' && ey !== 'settled') return { status: 'blocked', blockers: ['Earlier years: say whether you had zakat due in an earlier year (then confirm it was paid), or that this is the first time. This is a fact about you, not a ruling, and no amount is given without it.'], method: out.method, rows };
    if (isFirst) {
      if (o.keptAboveNisabThroughFirstHawl !== true) return { status: 'blocked', blockers: ['First hawl: Elewa teaches that the count starts when wealth reaches nisab and the zakat is then taken on what exists on the zakat date. He does not say what applies if the total fell below nisab during this first year. Without confirmation that it stayed at or above nisab since ' + nisabDate + ', no liability is declared.'], method: out.method, rows };
    } else if (ey !== 'settled') {
      return { status: 'blocked', blockers: ['This is not the first zakat date after nisab. Whether earlier years were paid, and any unpaid years, are not covered here: confirm they are settled.'], method: out.method, rows };
    }
    out.firstHawl = isFirst;
    out.due = true; out.amount = base * RATE; out.gramsEquivalent = out.amount / price;
    return out;
  }

  const api = { toHijri, hawlEnd, zakat, zakatElewa, NISAB, RATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DHB_ZAKAT = api;
})(typeof window !== 'undefined' ? window : globalThis);
