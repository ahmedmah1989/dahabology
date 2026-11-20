# Quote time and offline status remediation

Review only. No merge, deployment, cron activation, key activation, paid upgrade or server work.

## User-visible changes

- Calculator, invoice and wallet put original local quote time and age next to the result. Cairo date/time includes the year. Up to five minutes is recent; older is explicitly delayed. The existing24hour maximum and two-minute future tolerance stay unchanged.
- Manual calculator prices stay labelled as user-entered. Invoice distinguishes a manual purchase-day basis from the current dealer-buy quote used for resale. Expired quotes do not value the wallet, but saved holdings/costs remain.
- Age refreshes every30seconds and on tab return, without an extra data request. This updates the display; the existing60second network cadence is unchanged.
- The service worker marks returned JSON as network or cache, retaining the last successful online check timestamp. Cached data cannot clear the connection warning. A service failure with browser networking available is distinguished from an offline device. An older controlling worker without provenance is unverified, not presumed online.
- Exported PNG includes original gold quote time, delayed/recent qualification, separate image creation time, and saved-data/unverified status. Optional bank/ounce values carry their own timestamps. Invalid or expired local quotes cannot be exported, checked again at generation time.
- No source names added to the interface. Glowing rings, navigation and formulas unchanged.

## Verification

After `npm ci` and `npm run build`:

```
node --test tests/*.test.js tests/*.test.cjs
```

The independent browser acceptance script is optional and requires Playwright with Chromium available. Install Playwright locally without changing the lockfile if needed, then:

```
node scripts/quote-time-acceptance.cjs
```

`DHB_PLAYWRIGHT` may point to an already installed Playwright module. `DHB_EVIDENCE` selects the screenshot/results folder (default /tmp/dhb-quote-evidence). The script serves the local build on4176, supplies synthetic quote fixtures, tests actual service-worker caching and writes screenshots plus acceptance.json. It never calls merchant write endpoints or deploys anything.

Coverage: fresh,6minute,12hour,older24hour,invalid/future times; aging while open and on return; manual preservation; invoice purchase/resale basis; mixed gift/paid wallet; offline reopening; service failure while browser is online; recovery with unchanged quote value; corrupt cached JSON; expired PNG requests. Unit tests cover exact5minute/24hour limits and absent/malformed/offsetless timestamps. Chromium checks do not replace real Safari/Android sharing tests.

This branch is based on main and deliberately excludes the independent wallet percentage fix PR5. Review with PR2/3/4/5 together before release. No production effects until separately approved.
