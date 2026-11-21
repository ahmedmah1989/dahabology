// Account + per-user data layer. The only file that talks to Firebase.
// If the backend changes later, replace this file; pages use only the exports below.
import { FIREBASE } from "./firebase-config.js";

const AUTH = "https://identitytoolkit.googleapis.com/v1";
const TOKEN = "https://securetoken.googleapis.com/v1/token";
const FS = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
const KEY = "dahabology.session.v1";
const store = () => (typeof localStorage !== "undefined" ? localStorage : memoryStore);
const memoryStore = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };

export const MESSAGES_AR = {
  EMAIL_EXISTS: "هذا البريد مسجّل بالفعل. جرّب تسجيل الدخول، أو استخدم «نسيت كلمة السر».",
  INVALID_EMAIL: "صيغة البريد غير صحيحة. راجعها وحاول مرة أخرى.",
  PASSWORD_DOES_NOT_MEET_REQUIREMENTS: "كلمة السر لا تحقق الشروط. استخدم 8 أحرف على الأقل.",
  WEAK_PASSWORD: "كلمة السر ضعيفة. استخدم 8 أحرف على الأقل.",
  INVALID_LOGIN_CREDENTIALS: "البريد أو كلمة السر غير صحيحة. لو نسيتها استخدم «نسيت كلمة السر».",
  INVALID_PASSWORD: "البريد أو كلمة السر غير صحيحة.",
  EMAIL_NOT_FOUND: "البريد أو كلمة السر غير صحيحة.",
  USER_DISABLED: "هذا الحساب موقوف.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "محاولات كثيرة. انتظر دقائق ثم حاول مرة أخرى.",
  NETWORK: "تعذّر الاتصال بالإنترنت. تحقق من الاتصال وحاول مرة أخرى.",
  EMAIL_NOT_VERIFIED: "لم يتم تأكيد بريدك بعد. افتح رسالة التأكيد (وراجع البريد المزعج) ثم اضغط الرابط، أو اطلب رسالة جديدة.",
  PERMISSION_DENIED: "غير مسموح. سجّل الدخول بحساب مؤكَّد البريد.",
  SERVICE_UNAVAILABLE: "خدمة الحسابات متوقفة مؤقتًا من جهتنا، فلا يمكن التسجيل أو الحفظ الآن. جرّب بعد قليل. الصفحات والأسعار شغّالة بدون حساب.",
  DEFAULT: "حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل."
};

export class AccountError extends Error {
  constructor(code) { super(code); this.code = code; this.ar = MESSAGES_AR[code] || MESSAGES_AR.DEFAULT; }
}

// The backend project itself refuses service (suspended or access denied at the service level). This is not a user or rules
// error: say so, and never treat it as "sign in again" (it must not clear a saved session).
const unavailable = (data) => {
  const e = data?.error; if (!e) return false;
  const reasons = (e.details || []).map((d) => d.reason);
  return reasons.includes("CONSUMER_SUSPENDED") || /has been suspended|Permission denied on the service/i.test(String(e.message || ""));
};
async function call(url, body, method = "POST", token) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch { throw new AccountError("NETWORK"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (unavailable(data)) throw new AccountError("SERVICE_UNAVAILABLE");
    const raw = String(data?.error?.message || data?.error?.status || res.status);
    const code = raw.split(" : ")[0].split(" ")[0];
    throw new AccountError(res.status === 403 ? "PERMISSION_DENIED" : res.status === 404 ? "NOT_FOUND" : code);
  }
  return data;
}

const listeners = new Set();
let session = null;
function save(s) { session = s; s ? store().setItem(KEY, JSON.stringify(s)) : store().removeItem(KEY); listeners.forEach((f) => f(publicUser())); }
function publicUser() { return session ? { uid: session.uid, email: session.email, emailVerified: session.emailVerified } : null; }
function load() { if (!session) { try { session = JSON.parse(store().getItem(KEY)); } catch { session = null; } } return session; }
function toSession(d, prev = {}) {
  return { uid: d.localId || d.user_id || prev.uid, email: d.email || prev.email, idToken: d.idToken || d.id_token, refreshToken: d.refreshToken || d.refresh_token, expiresAt: Date.now() + (Number(d.expiresIn || d.expires_in) - 60) * 1000, emailVerified: prev.emailVerified ?? false };
}
async function lookup(idToken) {
  const d = await call(`${AUTH}/accounts:lookup?key=${FIREBASE.apiKey}`, { idToken });
  return d.users?.[0];
}
async function freshToken() {
  const s = load();
  if (!s) throw new AccountError("PERMISSION_DENIED");
  if (Date.now() < s.expiresAt) return s.idToken;
  let res;
  try { res = await fetch(`${TOKEN}?key=${FIREBASE.apiKey}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.refreshToken)}` }); } catch { throw new AccountError("NETWORK"); }
  const j = await res.json();
  if (!res.ok) { if (unavailable(j)) throw new AccountError("SERVICE_UNAVAILABLE"); save(null); throw new AccountError("PERMISSION_DENIED"); }
  // Re-read verification state: the token claim must be refreshed after the user verifies.
  const u = await lookup(j.id_token);
  save({ ...toSession(j, s), emailVerified: !!u?.emailVerified });
  return session.idToken;
}

// A saved session can outlive its account (deleted in the console, disabled, token revoked). Ask the server on page load;
// only a definite "no such user / bad token" answer clears it. A network failure keeps it.
export async function validateSession() {
  const s = load(); if (!s) return currentUser();
  try {
    const t = await freshToken();
    const u = await lookup(t);
    if (!u) { save(null); return null; }
    // The saved token only carries email_verified from when it was issued. If the server now says verified but the saved
    // session was not, get a fresh token first, or every write is refused until the old token expires.
    if (u.emailVerified && !s.emailVerified) { const c = load(); c.expiresAt = 0; save(c); await freshToken(); }
    else if (!!u.emailVerified !== !!s.emailVerified) save({ ...load(), emailVerified: !!u.emailVerified });
  } catch (e) {
    if (["USER_NOT_FOUND", "INVALID_ID_TOKEN", "TOKEN_EXPIRED", "CREDENTIAL_TOO_OLD_LOGIN_AGAIN", "USER_DISABLED", "PERMISSION_DENIED"].indexOf(e.code) >= 0) save(null);
  }
  return currentUser();
}
export function currentUser() { load(); return publicUser(); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function signUp(email, password) {
  const d = await call(`${AUTH}/accounts:signUp?key=${FIREBASE.apiKey}`, { email, password, returnSecureToken: true });
  save({ ...toSession(d), emailVerified: false });
  // The account now exists. A failed mail must not look like a failed sign-up: the verify screen offers "resend".
  let verificationSent = true;
  try { await call(`${AUTH}/accounts:sendOobCode?key=${FIREBASE.apiKey}`, { requestType: "VERIFY_EMAIL", idToken: d.idToken }); } catch { verificationSent = false; }
  return { ...publicUser(), verificationSent };
}
export async function signIn(email, password) {
  const d = await call(`${AUTH}/accounts:signInWithPassword?key=${FIREBASE.apiKey}`, { email, password, returnSecureToken: true });
  const u = await lookup(d.idToken);
  save({ ...toSession(d), emailVerified: !!u?.emailVerified });
  return publicUser();
}
export async function resendVerification() {
  const t = await freshToken();
  await call(`${AUTH}/accounts:sendOobCode?key=${FIREBASE.apiKey}`, { requestType: "VERIFY_EMAIL", idToken: t });
}
// Re-check after the user clicked the email link. Forces a fresh token so rules see email_verified.
export async function refreshVerification() {
  const s = load();
  if (!s) throw new AccountError("PERMISSION_DENIED");
  s.expiresAt = 0; save(s);
  await freshToken();
  return publicUser();
}
export async function sendPasswordReset(email) {
  // Same neutral result whether or not the email exists (no account enumeration from the UI).
  try { await call(`${AUTH}/accounts:sendOobCode?key=${FIREBASE.apiKey}`, { requestType: "PASSWORD_RESET", email }); }
  catch (e) { if (e.code !== "EMAIL_NOT_FOUND") throw e; }
}
export function signOut() { save(null); }

function requireVerified() {
  const s = load();
  if (!s) throw new AccountError("PERMISSION_DENIED");
  if (!s.emailVerified) throw new AccountError("EMAIL_NOT_VERIFIED");
  return s;
}
// Per-user documents live only under users/{uid}/... (matches firestore.rules).
// Run a data call with a valid token. If the server refuses (token issued before verification), refresh once and retry.
async function authed(fn) {
  const s = requireVerified();
  try { return await fn(s, await freshToken()); }
  catch (e) {
    if (e.code !== "PERMISSION_DENIED") throw e;
    const c = load(); if (!c) throw e; c.expiresAt = 0; save(c);
    return await fn(s, await freshToken());
  }
}
export async function saveDoc(path, data) {
  const fields = { json: { stringValue: JSON.stringify(data) } };
  await authed((s, t) => call(`${FS}/users/${s.uid}/${path}`, { fields }, "PATCH", t));
}
export async function loadDoc(path) {
  try {
    const d = await authed((s, t) => call(`${FS}/users/${s.uid}/${path}`, undefined, "GET", t));
    return JSON.parse(d.fields.json.stringValue);
  } catch (e) { if (e.code === "NOT_FOUND" || e.code === "404") return null; throw e; }
}
export async function deleteDoc(path) {
  await authed((s, t) => call(`${FS}/users/${s.uid}/${path}`, undefined, "DELETE", t));
}
