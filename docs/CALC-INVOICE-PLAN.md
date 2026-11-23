# Plan: merge افحص الفاتورة into الحاسبة as a third mode (stage 2)

Status: IMPLEMENTED on branch merge-market-tabs (commits cf70f97, e9206b8, a33c4e6), not published, pending final independent review. Grounded in the
UX review (worker agent-01M82ZVRPCX11X33MQVEK3WM3H, v2 proposal 2026-11-23 04:25):
"Next candidate: الحاسبة + فحص الفاتورة as a third mode (invoice logic stays separate,
PWA shortcut must keep working)." User 05:08 authorized beneficial merges in principle;
parent 05:16 authorized calculator+invoice grounding/planning only, no commitment to build
or publish.

## Current state (verified in code)

- `/calculator/` = src/pages/calculator.astro + src/panels/calculator.html.
  Scripts: calc.js (guarded by `#cResult`), calc-live.js, monitor.js, ui.js.
  Modes: أشتري / أبيع segmented buttons (`[data-mode]`), karat group drives hidden `#cKarat`.
- `/invoice/` = src/pages/invoice.astro + src/panels/invoice.html.
  Scripts: tools.js + monitor.js + ui.js. tools.js invoice section is guarded by `#invOut`
  presence (listener binding at tools.js:82-87 only runs `if ($('invOut'))`).
- tools.js also carries wallet (`dhb-wallet-v1` localStorage) and share-card logic, all
  element-guarded the same way; invoice.astro already loads it standalone with the wallet
  parts inert. The wallet SAVE flow (invoice-form.js, images, account) lives on `/wallet/`
  only and is out of scope here.
- Panels share zero element IDs (verified with comm on both files). Naming is namespaced:
  calculator `c*`, invoice `inv*`. ui.js karat/segment buttons work off generic
  `[data-set]` → hidden `<select>` wiring, so both groups coexist.
- Both pages compute from the same `gold-board-updated` monitor event. calc.js and tools.js
  each keep their own `last` quote cache; no shared mutable state.
- IDs/semantics that must survive verbatim: invoice editable historical price honesty
  ("الحساب بسعر الجرام الذي أدخلته" / dataset.edited flow), donut `invDonutPct` (numeric
  circle rule: complete number, one line), verdict thresholds, `invReset`; calculator
  buy/sell persistence and the live-conversion hint `cLive`.

## Proposed structure (mirrors the proven market-tabs pattern)

1. `/calculator/` gains a WAI-ARIA tab strip (same markup/RTL keyboard/hash routing as
   `tabs-market.js`): **الحاسبة** (default, `#calculator`) and **افحص الفاتورة**
   (`#invoice`). One pane each; h1/title swap per mode, as in stage 1.
2. `public/js/tabs-calc.js` (new, small): switching, hash routing, and LAZY-load of
   tools.js on first invoice activation (tools.js is only needed for the invoice mode;
   plain calculator visits should not pay for wallet/share code it contains).
   After tools.js loads, replay board state via `DHB_BOARD.detail()` → dispatch
   `gold-board-updated` so the invoice price fills without waiting for the next cycle
   (same replay stage 1 added for analytics).
3. `/invoice/` becomes a redirect stub to `/calculator/#invoice` (JS replace + meta
   refresh + link, noindex) exactly like /analysis/ and /live/.
4. Repoints: home orbs (PAGES `invoice` entry), dock المزيد invoice href,
   assistant topic 'invoice' path, site.js HOME_OF. Sitemap keeps `/invoice/` (stub
   exists, same as stage 1). guide/about carry no direct /invoice/ links (checked).
5. Dock itself unchanged (5 slots + المزيد; dock redesign never approved).

## Touchpoints found (complete sweep)

- src/pages/calculator.astro, invoice.astro; src/panels/calculator.html, invoice.html
- public/js/tabs-calc.js (new); tools.js untouched (guards already correct)
- src/lib/site.js HOME_OF + PAGES; src/layouts/Base.astro MORE href
- src/pages/index.astro orbs; public/js/assistant-help.js topic path +
  tests/assistant.test.cjs path regex; public/js/assistant-ui.js paths Set
- src/pages/manifest.webmanifest.js: shortcut 'افحص الفاتورة' currently → /invoice/.
  Keep pointing at the stub for this candidate; repointing the manifest to
  /calculator/#invoice changes installed-app behavior — publication-gate decision,
  called out explicitly at publish time.

## Risks / open questions for parent

- Installed-PWA caching of old pages after URL change is unverified (reviewer's caveat,
  carried). Needs a real-device check before publication.
- Lazy tools.js: its 30s interval + visibility listener start only after first invoice
  activation. Acceptable (invoice-only code), but the replay must be verified with real
  data, not assumed.
- The merged page loads monitor once (already true on both pages today); one loop serves
  both modes — same performance mechanism as stage 1, no benchmark number claimed.
- Invoice mode keeps its own karat group (invKarat) independent of calculator's cKarat —
  intentional: an invoice karat is a fact about a purchased piece, the calculator karat is
  a what-if; merging them would silently change user data meaning.

## Test plan (before any "ready" claim)

- Unit: tabs-calc VM tests mirroring tests/tabs-market.test.js (panes, lazy tools.js once
  + replay, RTL keyboard, hash routing, identity restore).
- Browser: review-calc-invoice.cjs mirroring review-tabs.cjs — default state, mode switch,
  lazy load order, offline honesty (invoice without price: "في انتظار السعر…" wording),
  deep links, /invoice/ redirect, dock/orb links, no overflow, keyboard, PLUS the
  bottom-clearance assertions from stage 1 (tab bar below sticky header, pane + footer
  clear of dock and Tut launcher at full scroll, center-scroll check on the invoice
  verdict row) at 320/390/1280.
- Real-data pass: calculator quote fills, invoice price prefills from live isagha quote,
  edited-price wording intact, donut percentage complete on one line.
- Full suites green: npm test, review.cjs, review-assistant.cjs, review-hints.cjs.
- Before/after mobile screenshots at 320/390 for the user's visuals.

## Implementation status (2026-11-23, local only, not published)

Implemented as planned, with one deviation and two review-driven fixes:

- Deviation: the board-state replay after lazy tools.js load uses a captured
  `gold-board-updated` detail inside tabs-calc.js (`lastDetail`), not the
  `DHB_BOARD.detail()` accessor - tools.js keeps no board.js dependency on this page.
- Fix 1 (parent finding): the tab strip styles moved from market-only CSS into the shared
  app.css so calculator/invoice tabs render the same selected/inactive gold distinction
  (they initially appeared identical). Pixel-verified at 320/390/1280.
- Fix 2 (parent finding): deep-link landing on /calculator/#invoice anchor-scrolled past
  the tab strip; tabs-calc.js now re-asserts the strip position at boot and again after
  load (the UA fragment jump races module scripts). Pixel-verified: strip visible on
  direct invoice entry, and switching to الحاسبة from there works without awkward recovery.
- Shared-CSS + market-boot side effect: e9206b8 touches app.css (shared) - final
  independent review must include the stage-1 regression delta, not treat aeddb49's
  approval as covering it (parent instruction 05:45).

### Verification evidence (all local, on a33c4e6)
- 9 VM unit tests (tests/tabs-calc.test.js) mirroring tabs-market tests: panes, lazy
  tools.js once + last-quote replay, RTL keyboard + focus, hash routing, identity restore,
  offline note with retry, online-event self-heal. 114 unit total PASS.
- review-calc-invoice.cjs: 109 assertions at 320/390/1280 - default state, lazy gating,
  switching + identity, selected/unselected visual distinction, keyboard, strip below
  sticky header, both panes + footer fully clear of dock and Tut launcher at full scroll,
  deep-link landing with strip visible, /invoice/ redirect, blocked-tools note + retry.
- review-calc-live.cjs: 5 real-data checks - invoice price prefills from live isagha,
  resale wording intact, verdict separates extra-above-gold, complete one-line donut
  percentage. Screenshot live-data-invoice.png.
- review-pwa.cjs case F (7 assertions): /calculator/ cached without opening invoice,
  offline deep link #invoice shows the connection-needed note with the no-stale-numbers
  promise and retry; reconnect (manual retry or online-event auto-retry) loads tools.js,
  note hides, and the invoice check computes from a manually entered price. 27 PWA total.
- Full suites green: 438 regression, 124 assistant, 96 hints, 163 market-tab assertions.
- Before/after visuals: before-invoice-bottom-390.png (live site, footer clipped by Tut
  launcher) vs bottom-invoice-bottom-390 (candidate, fully clear); live-data-invoice.png.

### Still gated (unchanged)
- No publication, no token, no live-site change. Manifest shortcut 'افحص الفاتورة' still
  points at /invoice/ (stub); repointing it is a publication-gate decision.
- Real installed-WebAPK behavior remains a physical-device boundary (as in stage 1).
