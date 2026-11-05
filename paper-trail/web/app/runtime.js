/* The web app's runtime. It plugs into paper-trail.html the same way Claude's artifact features do (see window.PT_RUNTIME
   in the app file), but the records, photos, and scanning come from your own Supabase project.

   Needs, in this order on the page: the Supabase browser library (vendor/supabase.js), config.js (window.PT_CONFIG),
   then this file, then the app. Nothing here is secret: the anon key in config.js is meant to be public, and the database rules
   (migrations/0001_init.sql) are what keep each family's papers private. */
(() => {
'use strict';

const cfg = window.PT_CONFIG || {};
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/* ---------- tiny helpers ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gate = () => document.getElementById('gate');

/* ---------- the signed-in person ---------- */
let user = null;       // { id, email }
let hid = null;        // the household id
let status = null;     // what my_status() last said: plan, trial end, scan numbers

async function loadStatus() {
  const { data, error } = await sb.rpc('my_status');
  if (error) throw error;
  if (!data) throw new Error('no_household');
  status = data;
  hid = data.household_id;
  return data;
}
const daysLeft = iso => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 864e5));
const planOpen = s => !!s && s.can_write === true;
const niceDay = iso => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

/* ---------- records ---------- */
const cache = new Map();   // id -> the record as the app keeps it
const listeners = [];
let loaded = false, loading = null, channel = null, lastKey = '';

const snapshot = () => {
  const docs = Array.from(cache, ([id, data]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(data)) }));
  return { docs, size: docs.length };
};
const notify = () => { const s = snapshot(); listeners.forEach(l => l.next(s)); };

async function fetchAll() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('records').select('id,data').order('created_at', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
async function refresh(quiet) {
  try {
    const rows = await fetchAll();
    const key = JSON.stringify(rows.map(r => [r.id, r.data]));
    if (loaded && quiet && key === lastKey) return;
    lastKey = key;
    cache.clear();
    rows.forEach(r => cache.set(r.id, r.data));
    loaded = true;
    notify();
  } catch (e) {
    if (!loaded) listeners.forEach(l => l.fail && l.fail(e));
  }
}
function listen() {
  if (channel) return;
  try {
    channel = sb.channel('records-' + hid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: 'household_id=eq.' + hid }, p => {
        if (p.eventType === 'DELETE') cache.delete(p.old && p.old.id);
        else if (p.new && p.new.id) cache.set(p.new.id, p.new.data);
        notify();
      })
      .subscribe();
  } catch (e) { /* live updates are a bonus: the refresh below still keeps things current */ }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refresh(true); loadStatus().catch(() => {}); } });
  setInterval(() => { if (document.visibilityState === 'visible') refresh(true); }, 60000);
}
function mapError(e) {
  const msg = String((e && (e.message || e.code)) || e);
  if (/record_limit/.test(msg)) return { code: 'quota_exceeded', message: msg };
  if (/row-level security|42501|permission denied/i.test(msg)) return { code: 'plan_closed', message: msg };
  return { code: 'unavailable', message: msg };
}
function ref(id, isNew) {
  return {
    id,
    async set(rec) {
      if (!isNew) {
        const { data, error } = await sb.from('records').update({ data: rec }).eq('id', id).select('id');
        if (error) throw mapError(error);
        if (data.length) { cache.set(id, rec); notify(); return; }
      }
      const { error } = await sb.from('records').insert({ id, household_id: hid, data: rec, created_by: user.id });
      if (error) throw mapError(error);
      cache.set(id, rec);
      notify();
    },
    async update(patch) {
      const next = Object.assign({}, cache.get(id) || {}, patch);
      const { data, error } = await sb.from('records').update({ data: next }).eq('id', id).select('id');
      if (error) throw mapError(error);
      if (!data.length) throw { code: 'plan_closed' };
      cache.set(id, next);
      notify();
    },
    async delete() {
      const { data, error } = await sb.from('records').delete().eq('id', id).select('id');
      if (error) throw mapError(error);
      if (!data.length && !planOpen(status)) throw { code: 'plan_closed' };
      cache.delete(id);
      notify();
    },
  };
}
const db = {
  collection() {
    return {
      doc: id => (id ? ref(id, false) : ref(crypto.randomUUID(), true)),
      onSnapshot(next, fail) {
        const l = { next, fail };
        listeners.push(l);
        if (loaded) queueMicrotask(() => next(snapshot()));
        else if (!loading) loading = refresh(false).then(listen);
        return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
      },
    };
  },
  doc(path) { return ref(path.split('/')[1], false); },
};

/* ---------- photos ---------- */
const urlCache = new Map();
const full = id => `${hid}/${id}.jpg`;
const thumbPath = id => `${hid}/${id}_t.jpg`;
function makeThumb(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const k = Math.min(1, 240 / Math.max(img.naturalWidth, 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('thumb'))), 'image/jpeg', 0.7);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('thumb')); };
    img.src = url;
  });
}
const assets = {
  async upload(blob) {
    const id = crypto.randomUUID();
    const up = await sb.storage.from('scans').upload(full(id), blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw mapError(up.error);
    try {
      const t = await makeThumb(blob);
      await sb.storage.from('scans').upload(thumbPath(id), t, { contentType: 'image/jpeg', upsert: false });
    } catch (e) { /* no small version: the list shows the full photo instead */ }
    return { id };
  },
  async delete(id) {
    await sb.storage.from('scans').remove([full(id), thumbPath(id)]);
    urlCache.delete(id);
  },
};
async function assetUrl(id, thumb) {
  if (thumb) {
    const s = await sb.storage.from('scans').createSignedUrl(thumbPath(id), 3600);
    if (!s.error && s.data && s.data.signedUrl) return s.data.signedUrl;
  }
  if (urlCache.has(id)) return urlCache.get(id);
  const d = await sb.storage.from('scans').download(full(id));
  if (d.error || !d.data) throw d.error || new Error('missing');
  const u = URL.createObjectURL(d.data);
  urlCache.set(id, u);
  return u;
}

/* ---------- reading a paper ---------- */
const toBase64 = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('read'));
  r.readAsDataURL(blob);
});
async function callScan(images, known, today, signal, retried) {
  const { data } = await sb.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw { code: 'session_expired' };
  let res;
  try {
    res = await fetch(cfg.supabaseUrl + '/functions/v1/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, apikey: cfg.supabaseAnonKey },
      body: JSON.stringify({ images, known, today }),
      signal,
    });
  } catch (e) {
    if (signal && signal.aborted) throw { code: 'cancelled' };
    throw { code: 'upstream_error' };
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* no body */ }
  if (res.status === 401 && !retried) {
    const r = await sb.auth.refreshSession();
    if (!r.error) return callScan(images, known, today, signal, true);
  }
  if (!res.ok || !body || !body.ok) throw { code: (body && body.error) || 'upstream_error' };
  if (typeof body.used === 'number') { status.scans_used = body.used; status.scan_cap = body.cap; }
  return body.result;
}
const scan = {
  maxCount: 4,
  async read({ images, known, today, signal }) {
    const encoded = await Promise.all(images.map(toBase64));
    return callScan(encoded, known, today, signal, false);
  },
};

/* ---------- saving a file ---------- */
const downloads = {
  async save({ filename, data }) {
    const type = /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : /\.jpe?g$/i.test(filename) ? 'image/jpeg' : 'application/octet-stream';
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { status: 'saved' };
  },
};

/* ---------- words the app shows ---------- */
const strings = {
  sessionExpired: 'Please sign in again, then try again.',
  blocked: 'Scanning is not available right now. You can still fill this one in by hand and keep the photo with it.',
  get quota() {
    return status && status.plan_status === 'trialing'
      ? 'You have used the scans that come with your free trial. You can still fill this one in by hand and keep the photo with it.'
      : 'You have used all of this month\'s scans. They start over on the first. You can still fill this one in by hand and keep the photo with it.';
  },
  get noAccess() {
    return status && status.plan_status === 'trialing'
      ? 'Your free trial has ended. You can still look at your papers. To add more, you will need a subscription.'
      : 'Your plan is not active right now. You can still look at your papers.';
  },
  scanOffGeneric: 'Scanning is not available right now. You can still add papers by hand.',
  get scanOffReadOnly() { return strings.noAccess; },
  scanOffBlocked: 'Scanning is not available right now. You can still add papers by hand.',
  scanOffStorage: 'Paper Trail could not reach your saved papers. Check your connection and reload the page.',
  homeFoot: 'Photos are sent to Claude, made by Anthropic, to be read. They are kept in your private account.',
  get planClosed() { return strings.noAccess; },
};

/* ---------- the account screen and the notice on the home screen ---------- */
function planLines() {
  const s = status;
  if (!s) return [];
  const used = `${s.scans_used} of ${s.scan_cap}`;
  if (s.plan_status === 'trialing' && s.can_write) return ['Free trial', `${daysLeft(s.trial_ends_at)} ${daysLeft(s.trial_ends_at) === 1 ? 'day' : 'days'} left. Scans used: ${used}.`];
  if (s.plan_status === 'trialing') return ['Your free trial has ended', 'You can still look at everything and save it as a spreadsheet. To add more, you will need a subscription.'];
  if (s.plan_status === 'active') return ['Subscribed', `${s.current_period_end ? 'Renews ' + niceDay(s.current_period_end) + '. ' : ''}Scans this month: ${used}.`];
  if (s.plan_status === 'past_due') return ['Your last payment did not go through', 'You can keep using Paper Trail while this is sorted out.'];
  return ['Your subscription has ended', 'You can still look at everything and save it as a spreadsheet. To add more, you will need a subscription.'];
}
const installed = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
function accountView(ctx) {
  const box = h('div', { class: 'acct' });
  const draw = () => {
    const [title, line] = planLines();
    box.replaceChildren(
      h('section', { class: 'fact-block' }, h('h3', null, 'Signed in as'), h('p', { class: 'fact-value', id: 'acctEmail' }, user.email)),
      h('section', { class: 'fact-block' }, h('h3', null, 'Your plan'), h('p', { class: 'fact-value', id: 'acctPlanTitle' }, title), h('p', { class: 'muted small', id: 'acctPlanLine' }, line),
        !planOpen(status) && cfg.subscribeUrl ? h('a', { class: 'btn', id: 'acctSubscribe', href: cfg.subscribeUrl }, 'Subscribe') : null,
        !planOpen(status) && !cfg.subscribeUrl ? h('p', { class: 'muted small' }, 'Subscribing is not open yet.') : null),
      h('section', { class: 'fact-block' }, h('h3', null, 'Your papers'),
        ctx.count ? h('button', { class: 'btn ghost', type: 'button', id: 'acctExport', onclick: ctx.exportAll }, 'Save all my papers as a spreadsheet') : h('p', { class: 'muted small' }, 'Nothing saved yet.'),
        h('p', { class: 'muted small' }, 'Your papers belong to you. Saving a spreadsheet gets you a copy any time, even after a trial or a subscription ends.')),
      installed() ? null : h('section', { class: 'fact-block', id: 'acctInstall' }, h('h3', null, 'Put it on your home screen'),
        h('p', { class: 'small' }, 'iPhone: tap the Share button, then Add to Home Screen. Android: tap the menu, then Install app or Add to Home screen.')),
      h('section', { class: 'fact-block' }, h('h3', null, 'More'),
        h('p', { class: 'small' }, h('a', { href: cfg.termsUrl || '/terms.html' }, 'Terms'), ' · ', h('a', { href: cfg.privacyUrl || '/privacy.html' }, 'Privacy')),
        cfg.supportEmail ? h('p', { class: 'small' }, 'Questions, or want your account and papers deleted? Email ', h('a', { href: 'mailto:' + cfg.supportEmail }, cfg.supportEmail), '.') : null,
        h('button', { class: 'btn ghost', type: 'button', id: 'acctSignOut', onclick: signOut }, 'Sign out')));
  };
  draw();
  loadStatus().then(draw).catch(() => {});
  return box;
}
function banner() {
  const s = status;
  if (!s) return null;
  let text = null, warn = false;
  if (s.plan_status === 'trialing' && s.can_write) {
    const left = Math.max(0, s.scan_cap - s.scans_used), d = daysLeft(s.trial_ends_at);
    text = `Free trial: ${d} ${d === 1 ? 'day' : 'days'} left, ${left} ${left === 1 ? 'scan' : 'scans'} to go.`;
  } else if (s.plan_status === 'trialing') { text = 'Your free trial has ended. You can look at everything, but not add.'; warn = true; }
  else if (s.plan_status === 'past_due') { text = 'Your last payment did not go through.'; warn = true; }
  else if (s.plan_status === 'canceled') { text = 'Your subscription has ended. You can look at everything, but not add.'; warn = true; }
  else if (s.plan_status === 'active' && s.scan_cap - s.scans_used <= 5) { const left = Math.max(0, s.scan_cap - s.scans_used); text = `${left} ${left === 1 ? 'scan' : 'scans'} left this month.`; }
  return text ? h('p', { class: 'notice' + (warn ? ' warn' : ''), id: 'planBanner' }, text) : null;
}
async function signOut() {
  try { await sb.auth.signOut(); } catch (e) { /* the page reloads either way */ }
  location.reload();
}

/* ---------- signing in ---------- */
function card(...kids) {
  return h('div', { class: 'gate-card' },
    h('div', { class: 'gate-brand' }, h('img', { class: 'gate-logo', src: '/icons/icon.svg', alt: '', width: '44', height: '44' }), h('span', { class: 'gate-name' }, 'Paper Trail')),
    ...kids);
}
function mount(node) { gate().replaceChildren(node); }
function emailStep(resolve, note) {
  const email = h('input', { id: 'gateEmail', class: 'gate-input', type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com', required: true, 'aria-label': 'Your email' });
  const msg = h('p', { class: 'gate-msg', id: 'gateMsg', role: 'alert' }, note || '');
  const btn = h('button', { class: 'btn big', type: 'submit', id: 'gateSend' }, 'Send me a code');
  const form = h('form', { class: 'gate-form', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const addr = email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(addr)) { msg.textContent = 'That does not look like an email address.'; return; }
    btn.disabled = true; msg.textContent = '';
    const { error } = await sb.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
    btn.disabled = false;
    if (error) { msg.textContent = /rate|too many|seconds/i.test(error.message) ? 'Too many tries. Wait a minute, then try again.' : 'We could not send a code. Check the address and your connection, then try again.'; return; }
    mount(codeStep(addr, resolve));
    const c = document.getElementById('gateCode'); if (c) c.focus();
  } },
  h('label', { for: 'gateEmail', class: 'gate-label' }, 'Your email'), email, btn, msg);
  return card(
    h('h1', { class: 'gate-title' }, 'Scan it. File it. Find it later.'),
    h('p', { class: 'gate-lead' }, 'Snap a receipt, bill, or form. Claude reads it, you check it, and it is filed with your other house papers.'),
    form,
    h('p', { class: 'gate-small' }, (cfg.trialText || 'Try it free for 14 days.') + ' We email you a 6-digit code to sign in. No password to remember.'),
    h('p', { class: 'gate-small' }, 'By continuing you agree to the ', h('a', { href: cfg.termsUrl || '/terms.html' }, 'Terms'), ' and ', h('a', { href: cfg.privacyUrl || '/privacy.html' }, 'Privacy Policy'), '.'));
}
function codeStep(addr, resolve) {
  const code = h('input', { id: 'gateCode', class: 'gate-input gate-code', type: 'text', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8', pattern: '[0-9]*', placeholder: '123456', required: true, 'aria-label': '6-digit code' });
  const msg = h('p', { class: 'gate-msg', id: 'gateMsg', role: 'alert' });
  const btn = h('button', { class: 'btn big', type: 'submit', id: 'gateCheck' }, 'Check code');
  const again = h('button', { class: 'linkish', type: 'button', id: 'gateAgain', disabled: true }, 'Send a new code');
  let wait = 30;
  const tick = setInterval(() => {
    wait -= 1;
    again.textContent = wait > 0 ? `Send a new code (${wait})` : 'Send a new code';
    if (wait <= 0) { again.disabled = false; clearInterval(tick); }
  }, 1000);
  again.textContent = 'Send a new code (30)';
  again.addEventListener('click', async () => {
    again.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
    msg.textContent = error ? 'We could not send a new code. Wait a minute, then try again.' : 'A new code is on its way.';
  });
  const form = h('form', { class: 'gate-form', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const token = code.value.replace(/\s+/g, '');
    if (!/^\d{6,8}$/.test(token)) { msg.textContent = 'The code is 6 numbers.'; return; }
    btn.disabled = true; msg.textContent = '';
    const { data, error } = await sb.auth.verifyOtp({ email: addr, token, type: 'email' });
    btn.disabled = false;
    if (error || !data || !data.session) { msg.textContent = 'That code did not work. Check it, or send a new one.'; return; }
    clearInterval(tick);
    resolve(data.session);
  } },
  h('label', { for: 'gateCode', class: 'gate-label' }, 'Your 6-digit code'), code, btn, msg);
  return card(
    h('h1', { class: 'gate-title' }, 'Check your email'),
    h('p', { class: 'gate-lead' }, 'We sent a 6-digit code to ', h('strong', { id: 'gateSentTo' }, addr), '. It can take a minute. Look in spam if you do not see it.'),
    form,
    h('div', { class: 'gate-links' },
      again,
      h('button', { class: 'linkish', type: 'button', id: 'gateOther', onclick: () => { clearInterval(tick); mount(emailStep(resolve)); } }, 'Use a different email')));
}
function problemStep(text) {
  return card(
    h('h1', { class: 'gate-title' }, 'Something went wrong'),
    h('p', { class: 'gate-lead', id: 'gateProblem' }, text),
    h('div', { class: 'gate-links' },
      h('button', { class: 'btn', type: 'button', id: 'gateRetry', onclick: () => location.reload() }, 'Try again'),
      h('button', { class: 'linkish', type: 'button', id: 'gateSignOut', onclick: signOut }, 'Sign out')));
}

/* ---------- start ---------- */
window.PT_RUNTIME = {
  async connect() {
    document.getElementById('app').hidden = true;
    mount(card(h('p', { class: 'gate-lead', id: 'gateLoading' }, 'Getting ready...')));
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* signed out */ }
    for (;;) {
      if (!session) session = await new Promise(resolve => mount(emailStep(resolve)));
      try {
        user = { id: session.user.id, email: session.user.email };
        await loadStatus();
        break;
      } catch (e) {
        const expired = e && (e.status === 401 || /jwt|expired|invalid/i.test(String(e.message)));
        if (expired) { try { await sb.auth.signOut(); } catch (x) { /* already out */ } session = null; continue; }
        mount(problemStep(e && e.message === 'no_household'
          ? 'We could not set up your account. Try again, and if it keeps happening, email ' + (cfg.supportEmail || 'us') + '.'
          : 'We could not reach Paper Trail. Check your connection, then try again.'));
        await new Promise(() => {});
      }
    }
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.reload(); });
    document.getElementById('app').hidden = false;
    gate().replaceChildren();
    gate().hidden = true;
    return { db, scan, assets, assetUrl, downloads, canWrite: planOpen(status), strings, account: { view: accountView }, banner };
  },
};
})();
