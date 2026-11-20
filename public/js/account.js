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
  DEFAULT: "حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل."
};

export class AccountError extends Error {
  constructor(code) { super(code); this.code = code; this.ar = MESSAGES_AR[code] || MESSAGES_AR.DEFAULT; }
}

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
    const raw = String(data?.error?.message || data?.error?.status || res.status);
    const code = raw.split(" : ")[0].split(" ")[0];
    throw new AccountError(res.status === 403 ? "PERMISSION_DENIED" : code);
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
  if (!res.ok) { save(null); throw new AccountError("PERMISSION_DENIED"); }
  // Re-read verification state: the token claim must be refreshed after the user verifies.
  const u = await lookup(j.id_token);
  save({ ...toSession(j, s), emailVerified: !!u?.emailVerified });
  return session.idToken;
}

export function currentUser() { load(); return publicUser(); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function signUp(email, password) {
  const d = await call(`${AUTH}/accounts:signUp?key=${FIREBASE.apiKey}`, { email, password, returnSecureToken: true });
  save({ ...toSession(d), emailVerified: false });
  await call(`${AUTH}/accounts:sendOobCode?key=${FIREBASE.apiKey}`, { requestType: "VERIFY_EMAIL", idToken: session.idToken });
  return publicUser();
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
export async function saveDoc(path, data) {
  const s = requireVerified(); const t = await freshToken();
  const fields = { json: { stringValue: JSON.stringify(data) } };
  await call(`${FS}/users/${s.uid}/${path}`, { fields }, "PATCH", t);
}
export async function loadDoc(path) {
  const s = requireVerified(); const t = await freshToken();
  try {
    const d = await call(`${FS}/users/${s.uid}/${path}`, undefined, "GET", t);
    return JSON.parse(d.fields.json.stringValue);
  } catch (e) { if (e.code === "NOT_FOUND" || e.code === "404") return null; throw e; }
}
export async function deleteDoc(path) {
  const s = requireVerified(); const t = await freshToken();
  await call(`${FS}/users/${s.uid}/${path}`, undefined, "DELETE", t);
}
