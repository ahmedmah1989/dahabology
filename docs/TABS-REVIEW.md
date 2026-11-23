# Market tabs merge: design and review (internal, not published)

Stage 1 of the screen-merge work Ahmed approved Nov 23 ~05:08 (beneficial merges only, verified before any publication).
Merges /analysis/ and /live/ into /market/ as tabs. Calculator+invoice and wallet+account merges are NOT part of this stage.

## What changed
- `src/pages/market.astro`: three tab panes (السوق / التحليل / الرسم الحي) in one page; WAI-ARIA tablist, RTL keyboard (Left=next, Right=prev, Home/End), hash routing (#analysis, #live), per-tab h1 + document.title.
- `public/js/tabs-market.js` (new): switching, hash deep links, lazy loading.
- Analysis bundle (`analytics.js` + `ui.js`) loads ONLY on first التحليل activation: it pulls an external daily FX series, so plain market visits stay as light as before. After load, the board's current state is replayed so today's reading does not wait for the next refresh cycle (`DHB_BOARD.detail()` accessor added in `board.js`).
- `live-view.js` stays eager (small, same-origin data only) and exposes `DHB_LIVE_RENDER` so the chart re-renders when its tab opens.
- `/analysis/` and `/live/` are now tiny redirect pages (JS `location.replace` + meta refresh + manual link, `noindex`). Installed-app shortcuts, assistant topic links, about-page link and search results keep working.
- Dock المزيد entries for التحليل/الرسم الحي point straight at `market/#analysis` / `market/#live` (no redirect hop). Dock itself unchanged (5 slots; dock redesign was never approved).
- `site.js` HOME_OF: old `#analysis`/`#live` cross-links from other pages now rewrite to `/market/#…`.

## What is preserved (verified, not assumed)
- Distinct price/time/source semantics per view: market hero keeps sell price + change vs last close + source time; analysis keeps today's provisional reading with "ليست إغلاقًا نهائيًا", CBE dated FX basis wording, and historical-series separation; live keeps session-vs-90-day distinction and "نقطة تمثل السعر المرصود" honesty for a single reading.
- One monitor/refresh loop now serves all three views (previously each page ran its own) — the actual performance mechanism of the merge. No performance number claimed beyond that.
- Discovery hints, assistant panel, dock, refresh button, karat persistence, share button: unchanged code paths.
- 24 build pages (stubs are still pages). No Firebase, account, wallet, collector, or zakat code touched.

## Follow-up fixes after independent review of 5551faa (same branch, amended)
- Bottom clearance: the fixed Tut launcher (reaches ~182px up from the viewport bottom, left side) could sit over the footer's last lines at full scroll on narrow phones, covering links like المساعد الذكي. Footer now gets 90px extra bottom padding at ≤560px so its content rises fully above the launcher at full scroll. Pane content itself already had ~365px clearance; measured, not assumed.
- Direct internal links (reviewer suggestion): home orbs, the about-page افهم link, and the assistant analysis topic now point straight to /market/#analysis (orbs also /market/#live), skipping the redirect stubs — helps offline/PWA. The stubs remain for old external links and shortcuts.

## Test evidence (all local, synthetic + real-data)
- 105 unit tests pass (`npm test`), incl. 7 new tabs tests (VM: panes, lazy-load once + replay, RTL keyboard, hash routing, identity restore).
- 148 browser assertions (`review-tabs.cjs`) at 320/390/1280, external network blocked: default state, tab switching, lazy load order (analytics → ui), offline honesty (CBE-unavailable wording, no crash), deep links, both redirects, dock links, no horizontal overflow, keyboard + focus, tab bar lands below the sticky header after tab clicks, every pane's last element AND the footer links fully clear both the dock and the Tut launcher at full scroll, and the analysis market-readings row center-scrolls clear of fixed chrome.
- 438-check main regression (`review.cjs`) PASS; 124 assistant assertions PASS; 96 hint assertions PASS (one transient TimeoutError on a run started during rebuild; passed 2x after).
- Real-data pass (`review-tabs-live.cjs`, network allowed): hero 5,600 EGP with close-reference; analysis 3,585.20$ provisional reading with CBE 22-11-2026 basis; live session point drawn with honest single-reading note; round trip intact. Screenshots in /downloads/dahab-tabs/.
- Before/after mobile visuals: before-*.png (live site, bottom-scrolled, launcher over footer links) vs bottom-*.png (candidate, fully clear) at 320/390.

## Reliability fix after the second independent pass (same branch, amended)
- Offline first activation of التحليل: the lazy analytics bundle is versioned (?v=SHA), so a
  device upgrading while offline had the market shell cached but not the new analytics URL -
  the tab showed waiting text and dashes indefinitely (found by the reviewer, reproduced).
  Fix in tabs-market.js: load failure now shows an explicit Arabic connection-needed state
  ("تعذّر تحميل التحليل الآن، غالبًا لانقطاع الاتصال. لن نعرض أرقامًا قديمة كأنها جديدة.")
  with an إعادة المحاولة button, plus self-healing auto-retry on the browser online event.
  Previously-cached offline analysis is untouched (cached bundle keeps working offline).
- SW precaching of the versioned bundle was considered and rejected: sw.js is a static file
  with no build-time version injection, and network-first navigation already covers online use.

## PWA upgrade/offline evidence (review-pwa.cjs, 20 assertions, SW enabled in Chromium)
Two builds served from one origin, switched mid-test to simulate the deploy (baseline
6360a236 ASSET_VERSION oldsha000000 -> candidate, ASSET_VERSION testmerge123):
- A: online post-deploy navigation to /analysis/ serves NEW html and redirects to the merged
  tab (network-first + no-store + _dhb_page cache-bust); the new versioned SW takes control;
  no page errors. Never stale-while-online.
- B: after upgrade, offline deep link /market/#analysis and the /analysis/ stub both work
  from cache with honest offline wording.
- C: fresh device offline with no cache fails honestly (browser offline, no fake content).
- D: a device that only ever saw the old build and goes offline post-deploy still gets its
  working previous-version analysis page from cache (graceful degradation, source times intact).
- E: offline first-ever analysis tap now shows the connection-needed state with retry;
  reconnect fills the analysis via manual retry or the online-event auto-retry.
Boundary that remains physical: the actual installed WebAPK shell on the user's device
(launch icon behavior, display-mode standalone chrome, WebAPK update timing) cannot be
exercised from here - not claimed as tested. SW registration uses reg.update() per load, but
real-device next-open timing was not proven by automation.
- Fixed Tut launcher and dock still overlay bottom content while mid-scroll on long pages (standard fixed chrome; everything remains reachable, now asserted). The footer clearance fix lives in the shared app.css, so it lifts the footer above the launcher on every Base-layout page (market, invoice, calculator, wallet, about, guide, assistant, account-preview), not only the merged screens. Home keeps its own layout and launcher placement (already clear).
- Physical phone/PWA keyboard behavior untested (short-viewport simulation only, as before).

## Deliberately not done
- No publication, no token, no live-site change. No calculator+invoice merge yet (next stage). No wallet+account (not ready per review). No assistant/about/guide merge (later). No performance guarantee wording for the user.

## Stage 2 cross-reference (calculator + invoice)
Stage 2 (merge /invoice/ into /calculator/ as tabs) is implemented on the same branch and
documented in docs/CALC-INVOICE-PLAN.md (status section). Note for the final independent
review: commit e9206b8 moved the tab-strip styles into the SHARED app.css, so the stage-1
screens' regression delta after aeddb49 must be re-verified - aeddb49's approval does not
cover that shared change (parent instruction 05:45). PWA evidence now includes case F
(invoice lazy path offline), 27 assertions total.
