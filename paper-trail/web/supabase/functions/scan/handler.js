// The scan service. One request in, one request out:
//   POST  { images: [base64 JPEG, up to 4], known: [names the family already uses], today: "YYYY-MM-DD" }
//   with the signed-in person's token in the Authorization header.
//
// What it does, in order, and why:
//   1. Looks at the request without trusting it (size, shape, JPEG only), so nothing odd reaches the paid step.
//   2. Asks Supabase who the person is. A made-up or expired token stops here.
//   3. Asks the database to count one scan (begin_scan): this checks the plan and the cap in one step.
//   4. Builds the instructions itself and sends the photos to Claude. The app never sends instructions,
//      so nobody can use this service as a free chatbot.
//   5. Cleans what comes back to the fields Paper Trail knows, and gives the scan back if the read failed on our side.
//
// It has no web server of its own: index.ts (Deno) and the tests both call handle().
import { CATS, buildScanPrompt } from './prompt.js';

const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 2_500_000;      // about 1.9 MB of JPEG per photo; the app sends about 0.3 to 1 MB
const MAX_BODY_BYTES = 8_000_000;
const MAX_KNOWN = 40;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-5-5';
const EFFORTS = new Set(['low', 'medium', 'high']);
const CAT_IDS = new Set(CATS.map(c => c.id));
const UNSURE_KEYS = new Set(['category', 'title', 'date', 'vendor', 'subject', 'total', 'mileage', 'work', 'details', 'nextDueDate', 'nextDueNote', 'notes']);

// ---------- helpers ----------

function corsHeaders(req, env) {
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const h = { vary: 'origin' };
  if (list.includes('*') || (origin && list.includes(origin))) {
    h['access-control-allow-origin'] = list.includes('*') ? '*' : origin;
    h['access-control-allow-headers'] = 'authorization, content-type, apikey, x-client-info';
    h['access-control-allow-methods'] = 'POST, OPTIONS';
    h['access-control-max-age'] = '600';
  }
  return h;
}
function reply(status, body, cors) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
}
const clean = (v, max) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
  .replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

// Photos must be base64 JPEG. "/9j/" is how a JPEG starts once it is base64.
function checkImages(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) return false;
  return images.every(s => typeof s === 'string' && s.length > 100 && s.length <= MAX_IMAGE_CHARS && s.startsWith('/9j/') && /^[A-Za-z0-9+/]+={0,2}$/.test(s));
}
function cleanKnown(known) {
  if (!Array.isArray(known)) return [];
  const seen = new Set(), out = [];
  for (const k of known) {
    const s = clean(k, 80);
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
    if (out.length >= MAX_KNOWN) break;
  }
  return out;
}

// What the model wrote, cut down to the fields the app understands, each the right type and a sensible length.
export function cleanResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.readable === false) return { readable: false };
  const num = (v, lo, hi) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const day = v => (isDay(v) ? v : null);
  const time = v => { const m = /^(\d{2}):(\d{2})$/.exec(typeof v === 'string' ? v.trim() : ''); return m && +m[1] < 24 && +m[2] < 60 ? m[1] + ':' + m[2] : null; };
  const list = (v, n, max) => (Array.isArray(v) ? v.map(x => clean(x, max)).filter(Boolean).slice(0, n) : []);
  const details = Array.isArray(raw.details)
    ? raw.details.map(d => ({ label: clean(d && d.label, 40), value: clean(d && d.value, 200) })).filter(d => d.label && d.value).slice(0, 10)
    : [];
  const mileage = num(raw.mileage, 0, 2_000_000);
  return {
    readable: true,
    category: CAT_IDS.has(raw.category) ? raw.category : 'other',
    title: clean(raw.title, 120) || null,
    date: day(raw.date),
    vendor: clean(raw.vendor, 120) || null,
    subject: clean(raw.subject, 120) || null,
    total: num(raw.total, 0, 1_000_000_000),
    mileage: mileage == null ? null : Math.round(mileage),
    work: list(raw.work, 12, 160),
    details,
    nextDueDate: day(raw.nextDueDate),
    nextDueTime: time(raw.nextDueTime),
    nextDueNote: clean(raw.nextDueNote, 160) || null,
    notes: clean(raw.notes, 600) || null,
    unsure: Array.isArray(raw.unsure) ? raw.unsure.filter(k => UNSURE_KEYS.has(k)) : [],
  };
}

// the first {...} in the reply, parsed; the model sometimes adds a word or a code fence around it
function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
}

// ---------- the service ----------

export async function handle(req, deps) {
  const env = deps.env || {};
  const f = deps.fetch || fetch;
  const now = deps.now || Date.now;
  const log = deps.log || (() => {});
  const cors = corsHeaders(req, env);
  const started = now();

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, cors);

  // 1. look at the request without trusting it
  const token = (/^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '') || [])[1];
  if (!token) return reply(401, { error: 'session_expired' }, cors);
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) return reply(413, { error: 'image_rejected' }, cors);
  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return reply(413, { error: 'image_rejected' }, cors);
    body = JSON.parse(text);
  } catch (e) {
    return reply(400, { error: 'image_rejected' }, cors);
  }
  if (!body || typeof body !== 'object' || !checkImages(body.images)) return reply(400, { error: 'image_rejected' }, cors);
  const known = cleanKnown(body.known);
  // the person's own date matters near midnight, so take theirs if it is within a day of ours
  const server = now();
  const today = isDay(body.today) && Math.abs(Date.parse(body.today + 'T12:00:00Z') - server) < 2 * 864e5 ? body.today : dayOf(server);

  // 2. who is asking
  let user = null;
  try {
    const r = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY } });
    if (r.ok) user = await r.json();
  } catch (e) { /* treated as not signed in */ }
  if (!user || !user.id) return reply(401, { error: 'session_expired' }, cors);
  if (String(env.REQUIRE_CONFIRMED_EMAIL || 'true') !== 'false' && !user.email_confirmed_at) return reply(403, { error: 'no_access', reason: 'confirm_email' }, cors);

  // 3. count one scan, and check the plan and the cap
  const sb = (name, args) => f(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify(args),
  });
  let gate;
  try {
    const r = await sb('begin_scan', { p_user: user.id });
    if (!r.ok) throw new Error('begin_scan ' + r.status);
    gate = await r.json();
  } catch (e) {
    log({ event: 'scan', ok: false, reason: 'gate_error' });
    return reply(503, { error: 'upstream_error' }, cors);
  }
  if (!gate || !gate.ok) {
    const reason = gate && gate.reason === 'quota_exceeded' ? 'quota_exceeded' : 'no_access';
    log({ event: 'scan', ok: false, reason });
    return reply(reason === 'quota_exceeded' ? 429 : 402, { error: reason, used: gate && gate.used, cap: gate && gate.cap }, cors);
  }
  const giveBack = async () => { try { await sb('refund_scan', { p_household: gate.household_id }); } catch (e) { /* a lost refund costs one scan, not the person's records */ } };

  // 4. read the paper
  const model = env.SCAN_MODEL || DEFAULT_MODEL;
  const effort = EFFORTS.has(env.SCAN_EFFORT) ? env.SCAN_EFFORT : 'low';
  const payload = {
    model,
    max_tokens: 1500,
    output_config: { effort },
    messages: [{
      role: 'user',
      content: [
        ...body.images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
        { type: 'text', text: buildScanPrompt(body.images.length, known, today) },
      ],
    }],
  };
  let data;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Number(env.SCAN_TIMEOUT_MS) || 50000);
  try {
    const r = await f(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    if (!r.ok) {
      await giveBack();
      const bad = r.status === 429 || r.status === 529 ? 'rate_limited' : r.status === 400 ? 'image_rejected' : 'upstream_error';
      log({ event: 'scan', ok: false, reason: 'anthropic_' + r.status });
      return reply(r.status === 400 ? 400 : 502, { error: bad }, cors);
    }
    data = await r.json();
  } catch (e) {
    await giveBack();
    log({ event: 'scan', ok: false, reason: ctl.signal.aborted ? 'timeout' : 'network' });
    return reply(502, { error: 'upstream_error' }, cors);
  } finally {
    clearTimeout(timer);
  }

  // 5. clean what came back
  if (data && data.stop_reason === 'refusal') {
    log({ event: 'scan', ok: true, readable: false, ms: now() - started });
    return reply(200, { ok: true, result: { readable: false }, used: gate.used, cap: gate.cap }, cors);
  }
  const text = Array.isArray(data && data.content) ? data.content.filter(b => b && b.type === 'text').map(b => b.text).join('') : '';
  const result = cleanResult(parseJson(text));
  if (!result) {
    await giveBack();
    log({ event: 'scan', ok: false, reason: 'bad_output' });
    return reply(502, { error: 'upstream_error' }, cors);
  }
  log({ event: 'scan', ok: true, readable: result.readable, ms: now() - started, in: data.usage && data.usage.input_tokens, out: data.usage && data.usage.output_tokens });
  return reply(200, { ok: true, result, used: gate.used, cap: gate.cap }, cors);
}
