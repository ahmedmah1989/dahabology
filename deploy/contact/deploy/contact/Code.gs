/**
 * Dahabology contact endpoint - Apps Script (REVIEWABLE CODE; deploy only into the owner-approved project).
 * Strict registered-sender mode (owner voice note 2026-11-25 12:13): every message must arrive from the
 * sender's VERIFIED registered account email; anonymous sends are refused with 'login-required'.
 *
 * Secrets/identity boundaries:
 * - The destination inbox lives in Script Property 'contact_destination' (set once in the editor).
 *   It is NEVER in this file, the client bundle, or any response. Unset => fail closed ('unconfigured').
 * - The Firebase web API key below is a PUBLIC client identifier (same value ships in
 *   public/js/firebase-config.js); it is not a secret.
 * - The visitor's ID token is used only for the accounts:lookup verification call. It is never
 *   written to email, logs, the ack payload, or any URL.
 *
 * Mechanics (documented platform behavior):
 * - Browser sends a SIMPLE POST (form enctype=text/plain, no custom headers) => no CORS preflight.
 * - The cross-origin response is not reliably readable by fetch, so doPost returns a tiny HTML page
 *   that confirms via top.postMessage({id, ok, reason}, APP_ORIGIN).
 * - Abuse control: honeypot field + durable atomic global daily cap via PropertiesService counter
 *   mutated under LockService (fail-closed). The cap is consumed ONLY after token verification
 *   succeeds, so unauthenticated traffic can never burn quota.
 * - Verification: ID token claims are checked for project binding (iss/aud), then Google
 *   (Identity Toolkit accounts:lookup) validates signature/expiry and reports emailVerified.
 *   Missing / malformed / wrong-project / invalid / expired / unverified => 'login-required'.
 */
const CONFIG = {
  APP_ORIGIN: 'https://ahmedmah1989.github.io',
  DEST_PROP: 'contact_destination',
  DAILY_CAP: 10,
  MAX_MESSAGE: 4000,
  PROP_KEY: 'contact_daily',
  FIREBASE_PROJECT_ID: 'dahabology-59961',
  FIREBASE_API_KEY: 'AIzaSyANdpYtAjbVRnlXSnwGOUrJi_sXG_uSltI', // public client identifier, same as public/js/firebase-config.js
  VERSION: 2
};

function destination_() {
  try {
    return String(PropertiesService.getScriptProperties().getProperty(CONFIG.DEST_PROP) || '').trim();
  } catch (e) {
    return ''; // unreadable store => fail closed
  }
}

function dayKey_() {
  return Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
}

/** Fail-closed atomic increment. Returns remaining capacity or -1 when the cap is reached / state unreadable. */
function takeSlot_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(CONFIG.PROP_KEY);
    let rec = null;
    try { rec = raw ? JSON.parse(raw) : null; } catch (e) { rec = null; }
    if (!rec || rec.day !== dayKey_()) rec = { day: dayKey_(), used: 0 };
    if (rec.used >= CONFIG.DAILY_CAP) return -1;
    rec.used += 1;
    props.setProperty(CONFIG.PROP_KEY, JSON.stringify(rec));
    return CONFIG.DAILY_CAP - rec.used;
  } finally {
    lock.releaseLock();
  }
}

function parsePlain_(body) {
  // enctype=text/plain posts raw lines of "name=value" (NOT URL-encoded); keep values verbatim.
  const out = {};
  String(body || '').split(/\r?\n/).forEach(function (line) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return out;
}

function padB64_(s) {
  const t = String(s || '');
  return t + '==='.slice(0, (4 - (t.length % 4)) % 4);
}

/**
 * Verify a Firebase ID token for THIS project. Returns { email } on a verified registered account,
 * or { error: 'login-required' } for anything else. Never throws, never logs the token.
 */
function verifyToken_(token) {
  const denied = { error: 'login-required' };
  if (!token || typeof token !== 'string' || token.length > 8192) return denied;
  const parts = token.split('.');
  if (parts.length !== 3) return denied;
  let claims;
  try {
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padB64_(parts[1]))).getDataAsString());
  } catch (e) {
    return denied; // malformed payload
  }
  // Project binding: a token minted for any other Firebase project is refused before any network call.
  if (!claims || claims.aud !== CONFIG.FIREBASE_PROJECT_ID ||
      claims.iss !== 'https://securetoken.google.com/' + CONFIG.FIREBASE_PROJECT_ID) return denied;
  let res;
  try {
    res = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + CONFIG.FIREBASE_API_KEY,
      { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true });
  } catch (e) {
    return denied; // verification service unreachable => refuse, do not trust the token
  }
  if (res.getResponseCode() !== 200) return denied; // invalid / expired / revoked (Google rejects)
  let user;
  try {
    const body = JSON.parse(res.getContentText());
    user = body && body.users && body.users[0];
  } catch (e) {
    return denied;
  }
  if (!user || user.emailVerified !== true || !user.email) return denied; // registered but NOT verified
  return { email: String(user.email).slice(0, 200) };
}

function reply_(id, ok, reason) {
  const payload = JSON.stringify({ id: id, ok: ok, reason: reason || '', v: CONFIG.VERSION });
  const html = '<!doctype html><meta charset="utf-8"><script>(' + 'function(){var p=' + payload + ';' +
    'try{top.postMessage(p,' + JSON.stringify(CONFIG.APP_ORIGIN) + ');}catch(e){}' +
    'document.body.textContent=p.ok?"تم":"تعذر";})();</' + 'script>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const data = parsePlain_(e && e.postData && e.postData.contents);
  const id = String(data.id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || 'unknown';
  if (data.website) return reply_(id, true); // honeypot: pretend-accept, drop (no lookup, no slot)
  const message = String(data.message || '').trim();
  if (!message) return reply_(id, false, 'empty');
  if (message.length > CONFIG.MAX_MESSAGE) return reply_(id, false, 'too-long');
  const dest = destination_();
  if (!dest) return reply_(id, false, 'unconfigured'); // fail closed, never silent
  const auth = verifyToken_(data.token);
  if (auth.error) return reply_(id, false, auth.error); // strict: no anonymous send
  if (takeSlot_() < 0) return reply_(id, false, 'cap');
  try {
    MailApp.sendEmail({
      to: dest,
      replyTo: auth.email, // the sender's verified registered address, server-derived
      subject: 'دهبولوجي - رسالة من الموقع (' + id + ')',
      body: 'رسالة:\n' + message + '\n\n---\nمن: ' + auth.email + ' (حساب مسجّل مؤكّد)\nالمعرف: ' + id
    });
  } catch (err) {
    return reply_(id, false, 'send-failed'); // honest negative ack; client keeps the text
  }
  return reply_(id, true);
}

/** Staging readback probe: confirms deployment + remaining capacity. Safe to call cross-origin via simple GET. */
function doGet() {
  const raw = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_KEY);
  let used = 0;
  try { const rec = raw ? JSON.parse(raw) : null; used = rec && rec.day === dayKey_() ? rec.used : 0; } catch (e) {}
  return ContentService.createTextOutput(JSON.stringify({
    ok: Boolean(destination_()), version: CONFIG.VERSION, day: dayKey_(), used: used, cap: CONFIG.DAILY_CAP
  })).setMimeType(ContentService.MimeType.JSON);
}
