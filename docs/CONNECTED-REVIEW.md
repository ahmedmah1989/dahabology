# Connected account and market corrections

Candidate only. Based on e200f40e333a25aebc03a4fa9b6feef7043bb5dc. No deployment or account-settings change performed.

## Scope
- Account: item type, catalog weight choices, karat and manual weight in that order. Catalog choices populate the stored grams input; Arabic manual input highlights its matching choice. New gold bars remain 24k, legacy bar karat and quantity/unit weight remain intact.
- Purpose: explicit adornment or saving/investment across bar, coin, jewelry and scrap in account, wallet invoice entry and old device-piece transfer. Applies to silver entry too. No automatic backfill for old records. Purpose describes the record and grants no religious ruling. Existing dormant zakat engine is not changed and its non-jewelry purpose limitation still blocks such inputs. There is no zakat page.
- Homepage: actual 21k/24k/derived18k, ounce, CBE reference, gold-implied dollar and global/local silver prices above navigation circles. Sources, units and dates/times are labelled; no local silver conversion is invented.
- Market: adjacent CBE and implied-dollar cards, compact silver summary with full local grades inside details.
- Current FX consumers: one CBE selector in quote-state.js. Monitor/gauge, home, analysis and share image use it, not Misr. The CBE source is an Average Market Rate in EGP with buy/sell columns and a date only. It is used only as an explicitly dated reference scenario, not a live executable FX quote. Existing 10-day display ceiling is retained for dated reference scenarios and disclosed. Local gold and ounce still need original <24h timestamps. No invented intraday time. The combined quality.fresh flag is always false for daily CBE, so gap alerts do not fire. Local-only peak alerts remain.
- Historical EGP chart rows retain their separate daily currency-series provenance. They are not relabelled as CBE history. Analysis global/FX scenarios do not depend on having a local gold quote.
- Numeric layout: number-fit.js keeps full numeric strings and their signs/fractions on one line inside market/wallet/calculator circles, invoice donut and numeric summary cards. It responds to text changes, font loading and resize, rather than truncating values.

## Verification
- npm test: 95 passed, 0 failed.
- npm run build: 24 pages built.
- node review.cjs: 438 browser assertions passed with synthetic fixtures, including widths 320/390/768/1280, account gold/silver and all item types, both purposes in wallet saves, unit and total weight, legacy metadata, invoice tax update, no silent Misr fallback, missing/stale sources and all four numeric-circle families with long positive/negative/decimal/percentage strings.
- Screenshots inspected at mobile width. Browser tests stub account transport and stop on any attempted real Firebase request. They do not verify production Firebase Rules, real account saving, a real phone keyboard or Ahmed's installed PWA.
- Service worker caching and existing account concurrency tests pass unchanged. No account.js or Firebase config changes. No change to the collector repository.
- Future publication needs fresh explicit approval for the release and any new temporary GitHub credential. Only the app repository needs this release.

## Sources
- https://www.cbe.org.eg/en/economic-research/statistics/exchange-rates
  Verified table date 19 Nov 2026, USD buy 53.7629 / sell 53.8629. No intraday time supplied.
- https://ahmedmah1989.github.io/gold-board/data/quotes.json
  Collector preserves quoteDate and quoteDateKind for CBE, sourceTime for timestamped gold/Misr data.
- https://ahmedmah1989.github.io/dahabology/
- https://ahmedmah1989.github.io/dahabology/market/
- https://ahmedmah1989.github.io/dahabology/account-preview/
  These are the currently published baseline, not this local candidate.

Browser test runtime: install playwright without saving it to package.json, use Chrome at the path in review.cjs, then run node review.cjs. Only synthetic inputs are written to its in-memory test transport.
