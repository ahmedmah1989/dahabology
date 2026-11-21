# Discovery hint candidate

Scope: same local assistant and Tut identity, two brief self-identifying hints on each page visit. No publication or new credential yet.

Design: no permanent whitespace, layout insertion or concealed body text. Home temporarily replaces only the decorative motto within its existing bounds. Inner pages temporarily replace only the header's brand-name lettering; the home-link emblem and actual page heading remain visible and usable. Original branding returns on timeout/dismiss/open/scroll/resize. This reuse of branding space keeps every original content position unchanged. The inner hint is shorter (أنا مساعدك الذكي), home uses أنا توت، مساعدك الذكي. اسألني. It is not attached directly to the lower-left launcher on inner pages, a deliberate readability/no-obstruction tradeoff.

First attempt after 1.2 seconds, second after three active-visible minutes. Each lasts6.5seconds, no loop. Opening assistant or dismissing suppresses all remaining hints on that page. Timers pause when the page is hidden. Scroll/resize hides an active hint; an offscreen branding area, editing controls, an open dock menu or another dialog suppresses that attempt. No forced scrolling or focus steal. Dismiss button returns focus to launcher. Touch target24px minimum for hint dismissal; chat/launcher behavior unchanged.

No storage/network in hint module. No prices/forms/calculators/account/collector/Rules/zakat changes.

Verification:98existing unit tests,24page build,84new controlled-clock assertions across320/390/768/1280,124assistant assertions,438previous connected-form/market assertions. New checks cover first/reminder/timeout/no-loop/dismiss/open suppression, hidden-page timing, brand-bound positioning and no layout movement on hide. Synthetic fixture/no real user writes. Actual pixels inspected on home320/390, inner320/390/1280. Physical phone/PWA remains unverified.

Commands: npm test && npm run build && node review-hints.cjs && node review-assistant.cjs && node review.cjs
