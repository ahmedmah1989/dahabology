/* Dahabology contact form client. State machine: idle -> sending -> sent | failed (text preserved).
   Transport (when configured): form POST enctype=text/plain into a hidden iframe (a "simple request",
   no CORS preflight); the Apps Script reply page confirms via postMessage to our origin.
   UNCONFIGURED by default: ENDPOINT empty => the in-app channel honestly shows as not yet active.
   STRICT REGISTERED SENDER (owner voice note 2026-11-25 12:13): sending requires an existing signed-in
   account with a verified email; the verified identity travels as the Firebase ID token and the server
   derives the reply address from it. Anonymous visitors see a login signpost and cannot send.
   The owner's receiving address never appears client-side (no MAILTO, no fallback link). */
(function () {
  'use strict';
  const CONFIG = {
    ENDPOINT: 'https://script.google.com/macros/s/AKfycbzF7F__8SGScn3TPIp1r1S3UJgMID7JLohwlZhF9Qn3aet1baP4Y_wz3ME-mYIUZx5FVA/exec', // Apps Script /exec URL - set after owner approval (2026-11-26)
    ORIGIN: 'https://script.googleusercontent.com', // reply host family; per-deployment subdomains allowed in classifyAck
    MAILTO: '', // stays empty forever: owner requires his address never be exposed client-side (voice 2026-11-25 12:13)
    TIMEOUT_MS: 20000
  };
  const MAX_LEN = 4000;

  function validate(message) {
    const m = String(message || '').trim();
    if (!m) return { ok: false, reason: 'empty' };
    if (m.length > MAX_LEN) return { ok: false, reason: 'too-long' };
    return { ok: true, message: m };
  }
  function msgId(now = Date.now, rand = Math.random) {
    return 'm-' + now().toString(36) + '-' + Math.floor(rand() * 1e9).toString(36);
  }
  function classifyAck(data, expectedId, origin) {
    // Apps Script serves user content from a per-deployment randomized subdomain of script.googleusercontent.com
    const m = /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.exec(origin || '');
    if (!m) return 'ignore';
    if (!data || typeof data !== 'object' || data.id !== expectedId) return 'ignore';
    if (data.ok === true) return 'sent';
    if (data.reason === 'login-required') return 'login-required';
    return 'failed';
  }
  const configured = () => Boolean(CONFIG.ENDPOINT);

  if (typeof module !== 'undefined') module.exports = { validate, msgId, classifyAck, configured, CONFIG, MAX_LEN };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const box = $('contactBox'); if (!box) return;
  const form = $('contactForm'), msg = $('contactMsg'), hp = $('contactWebsite');
  const status = $('contactStatus'), sendBtn = $('contactSend'), idField = $('contactId');
  const tokenField = $('contactToken'), badge = $('contactBadge'), login = $('contactLogin');

  function say(t) { status.textContent = t; }
  if (!configured()) {
    sendBtn.disabled = true;
    say('قناة التواصل المباشرة لسه قيد التفعيل، فمش هتتبعت أي حاجة دلوقتي. لو كتبت رسالتك هنا هتفضل في الخانة طول ما الصفحة مفتوحة، تقدر تنسخها.');
    return; // nothing else wired while unconfigured
  }

  function signpost(note) {
    // No verified session: the strict channel cannot send. Text stays in the box to copy.
    sendBtn.disabled = true;
    if (badge) badge.hidden = true;
    if (login) login.hidden = false;
    say(note || 'إرسال الرسائل بيتم من حسابك المسجّل المفعّل بس. سجّل دخولك الأول، ورسالتك هتفضل في الخانة طول ما الصفحة مفتوحة.');
  }

  form.action = CONFIG.ENDPOINT;
  let timer = null;

  init();

  async function init() {
    let account = null;
    try {
      account = await import(new URL('../js/account.js', document.baseURI));
      const u = await account.validateSession();
      if (!u || !u.emailVerified) account = null;
    } catch (e) {
      account = null; // auth module unreachable (offline/ad-blocker) -> honest signpost, no silent send
    }
    if (!account) { signpost(); return; }

    // Registered mode: identity comes from the verified session, not from anything the visitor types.
    badge.textContent = 'هيتبعت من بريدك المسجّل: ' + account.currentUser().email;
    badge.hidden = false;

    window.addEventListener('message', e => {
      const r = classifyAck(e.data, idField.value, e.origin);
      if (r === 'ignore') return;
      clearTimeout(timer);
      if (r === 'sent') { say('وصلت رسالتك. هنرد عليك في أقرب وقت.'); msg.value = ''; sendBtn.disabled = false; }
      else if (r === 'login-required') signpost('جلستك محتاجة تجديد أو بريدك لسه مش مفعّل. سجّل دخولك تاني ورسالتك هتفضل في الخانة.');
      else fail();
    });
    function fail() {
      say('مقدرناش نأكد الإرسال. رسالتك لسه في الخانة طول ما الصفحة مفتوحة، جرّب تاني.');
      sendBtn.disabled = false;
    }
    form.addEventListener('submit', e => {
      e.preventDefault(); // token attach is async; the real submit happens explicitly below
      const v = validate(msg.value);
      if (!v.ok) { say(v.reason === 'empty' ? 'اكتب رسالتك الأول.' : 'الرسالة أطول من ' + MAX_LEN + ' حرف، اختصرها لو سمحت.'); return; }
      sendBtn.disabled = true;
      say('بنبعت رسالتك…');
      account.idToken().then(tok => {
        idField.value = msgId();
        tokenField.value = tok;
        timer = setTimeout(fail, CONFIG.TIMEOUT_MS); // response unreadable cross-origin; iframe onload is not proof of acceptance
        form.submit(); // native submit into the hidden iframe (no handler re-entry)
      }).catch(() => {
        signpost('جلستك خلصت، سجّل دخولك تاني. رسالتك لسه في الخانة.');
      });
    });
  }
})();
