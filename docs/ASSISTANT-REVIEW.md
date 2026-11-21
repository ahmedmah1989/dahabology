# Local assistant candidate

Based on reviewed production 44433bf. Scope: local specialized app help, unchanged Tut asset/identity, compact launcher and tap-open panel. No provider/account signup, backend, external AI, private account access, autonomous mutations, collector or zakat changes.

- Same assets/tut-welcome-160.webp character used in launcher and panel; no replacement artwork.
- Home large AssistantWelcome removed. Small 54px home launcher sits top-left away from home navigation circles. Other pages use a small lower-left launcher above the dock. Light two-cycle motion only, disabled by reduced motion and existing motion-paused setting.
- One native modal dialog across all Base pages and home. Tap opens with input focus, Escape/close returns focus; native dialog traps keyboard focus. Short/visualViewport changes keep form in viewport. No automatic open or simulated typing.
- Eighteen maintained Arabic guide topics, limited follow-up context, source-price read and clear unknown/sensitive/write/refusal paths. This is not an LLM or general ChatGPT equivalent. No mathematical guesses: calculation questions open the existing tested calculator or invoice screen.
- Public prices are fetched only when requested, from the existing snapshot. Shared DHB_QUOTE handles dated CBE, no Misr fallback, original timestamps and source-age gates. Snapshot can lag the live market screen's direct gold-API refresh, explicitly labelled public-file prices. This does not modify existing price consumers.
- Privacy: no reading local/account holdings or identity, no question text in network URL/body, no chat persistence. Text rendered with textContent, allowlisted internal links, bounded 30 displayed messages, clear action and pagehide clearing. No automatic saves, downloads or notifications.

Verification:
- 98/98 Node tests including 3 new guide/source/safety suites.
- 24-page build.
- 124 additional synthetic Playwright assertions across 320/390/768/1280, including tap/focus/close/Escape, reduced motion, expected routes, text-only injection handling, CBE selection/missing/stale/failed network, link navigation/history reset, no unexpected account/provider/writes, no horizontal overflow, short viewport form position.
- Prior 438 synthetic connected-form/market assertions rerun unchanged after integration.
- Pixel inspection: closed390, chat390/1280, home320, prices320 and 320x380 short viewport. The latter is keyboard-space simulation, NOT an actual iOS/Android keyboard or installed-PWA verification.

Run: npm test && npm run build && node review-assistant.cjs && node review.cjs.
Screenshots: /downloads/dahab-assistant/ (synthetic prices and dates). Nothing published yet.
