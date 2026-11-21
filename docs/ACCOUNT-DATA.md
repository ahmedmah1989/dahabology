# Account data: structure and migration notes

Test preview only (`/account-preview/`, noindex, not in the navigation).

## Boundaries
- `public/js/firebase-config.js`: the only place with project identifiers (public client values).
- `public/js/account.js`: the only file that talks to Firebase (sign-up, sign-in, email verification, password reset, per-user documents). Pages call its exports only.
- `public/js/account-ui.js` and the page: no Firebase knowledge.

## Data layout (portable)
- User folder key: the Firebase user id `uid`. Keep it when migrating.
- `users/{uid}/gold/items` holds `{ v: 1, items: [ ... ] }`. Each item keeps its own stable `id`.
- Item fields: `id, label?, type (bar|coin|jewelry|scrap), karat, grams, purchaseDate (YYYY-MM-DD), purpose? (adornment|saving, jewelry only)`.
- `paid?` (number, the total the user paid for the piece, in EGP). Optional and written by the wallet page. Items without it are listed as unpriced and are not valued. Any page that edits an item must keep fields it does not edit, so `paid` survives edits.
- The document is stored as one JSON string field `json`, so it exports as plain JSON.

## When the backend is unavailable
If the Firebase project is suspended or unreachable, `account.js` raises `SERVICE_UNAVAILABLE` and the UI says the service is unavailable. A saved session is kept in that case (users are not signed out); only a real permission or token refusal clears it. Pieces already on the device stay on the device.

## Access rules
`firebase/firestore.rules`: only a signed-in user with a verified email may read or write their own `users/{uid}/**`. Everything else is denied.

## Moving later
1. Export: read each `users/{uid}/gold/items` document and keep the JSON as is (uid and item ids unchanged).
2. Replace `account.js` with an adapter exposing the same functions.
3. Re-test: two accounts, verification email, password reset, edits after reload and sign-out, cross-user denial.
Limits: Firebase password hashes are not portable by default, so users may need a password reset after moving auth to another provider; the Firestore rules do not carry over and must be rewritten for the new backend. Google's managed export needs a paid plan.
