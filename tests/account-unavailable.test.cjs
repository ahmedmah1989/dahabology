// A suspended backend must read as "service unavailable", must not clear a saved session, and must not hide real rules denials.
const test = require('node:test'), assert = require('node:assert');
test('suspended backend: clear message, session kept; rules denial unchanged', async () => {
  const store = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
  global.localStorage = store;
  const susp = { ok: false, status: 403, json: async () => ({ error: { message: "Permission denied: Consumer 'projects/1' has been suspended.", status: 'PERMISSION_DENIED', details: [{ reason: 'CONSUMER_SUSPENDED' }] } }) };
  const rules = { ok: false, status: 403, json: async () => ({ error: { message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } }) };
  let mode = susp; global.fetch = async () => mode;
  const A = await import('../public/js/account.js');
  await assert.rejects(() => A.signIn('a@b.co', 'x'), e => e.code === 'SERVICE_UNAVAILABLE' && /متوقفة/.test(e.ar));
  store.setItem('dahabology.session.v1', JSON.stringify({ uid: 'u', email: 'a@b.co', emailVerified: true, idToken: 't', refreshToken: 'r', expiresAt: 0 }));
  const u = await A.validateSession();
  assert.ok(u && store.getItem('dahabology.session.v1'), 'session must survive a suspended backend');
  mode = rules;
  await assert.rejects(() => A.signIn('a@b.co', 'x'), e => e.code === 'PERMISSION_DENIED');
});
