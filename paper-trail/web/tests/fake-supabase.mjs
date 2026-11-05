// A pretend Supabase for the browser tests. The page runs the real Supabase browser library, so every request it makes
// is a real one; this answers them the way Supabase would. It also pretends to be the scan service.
// Nothing here talks to the internet.
import fs from 'node:fs';

export const HOST = 'https://demo.supabase.co';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const HOUSEHOLD_ID = '22222222-2222-4222-8222-222222222222';
export const CODE = '123456';
const PIC = fs.readFileSync(new URL('./fixtures/receipt.png', import.meta.url));

export const CANNED = {
  readable: true, category: 'car', title: 'Oil change', date: '2026-10-02', vendor: 'Quick Lube on Main', subject: '2019 Toyota Highlander',
  total: 79.99, mileage: 48210, work: ['Synthetic oil change', 'Oil filter', 'Tire rotation'],
  details: [{ label: 'VIN', value: '5TDZZ3EH0KS000000' }], nextDueDate: '2027-01-10', nextDueTime: null, nextDueNote: 'Next oil change at 53,000 mi', notes: null, unsure: ['mileage'],
};

export function makeBackend() {
  const S = {
    email: null,
    tokens: new Map(),            // access token -> true
    plan: { plan_status: 'trialing', trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString(), current_period_end: null, can_write: true, scans_used: 0, scan_cap: 15 },
    records: new Map(),           // id -> { id, household_id, data, created_by, created_at }
    objects: new Map(),           // storage path -> true
    log: [],                      // every request, for the tests to look at
    scanCalls: [],
    scanMode: 'ok',               // ok | quota | noaccess | down
    otpRequests: [],
    badCodes: 0,
    signedOut: 0,
    expireSessions: false,
    scan401Once: false,
    seq: 0,
  };
  const status = () => ({ household_id: HOUSEHOLD_ID, name: 'Our household', ...S.plan });
  const session = () => {
    const access = 'access-' + (++S.seq);
    S.tokens.set(access, true);
    return {
      access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-' + S.seq,
      user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: S.email, email_confirmed_at: '2026-11-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' },
    };
  };
  const cors = origin => ({ 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range, content-length', vary: 'origin' });
  const json = (status, body, origin, extra = {}) => ({ status, headers: { 'content-type': 'application/json', ...cors(origin), ...extra }, body: body === undefined ? '' : JSON.stringify(body) });
  const bytes = (origin) => ({ status: 200, headers: { 'content-type': 'image/png', ...cors(origin) }, body: PIC });
  const rls = origin => json(403, { code: '42501', details: null, hint: null, message: 'new row violates row-level security policy for table "records"' }, origin);

  // returns a response for one request, or null for "not mine"
  async function answer(req) {
    const url = new URL(req.url());
    const origin = req.headers()['origin'];
    const method = req.method();
    const p = url.pathname;
    S.log.push({ method, path: p + url.search });
    if (method === 'OPTIONS') return { status: 204, headers: cors(origin), body: '' };
    const bearer = (req.headers()['authorization'] || '').replace(/^Bearer /i, '');
    const authed = S.tokens.has(bearer) && !S.expireSessions;
    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (e) { /* not json */ }

    // ---- sign in
    if (p === '/auth/v1/otp') { S.email = body.email; S.otpRequests.push(body); return json(200, {}, origin); }
    if (p === '/auth/v1/verify') {
      if (body.token !== CODE) { S.badCodes++; return json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, origin); }
      return json(200, session(), origin);
    }
    if (p === '/auth/v1/token') return S.expireSessions ? json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }, origin) : json(200, session(), origin);
    if (p === '/auth/v1/user') return authed ? json(200, session().user, origin) : json(401, { code: 401, msg: 'invalid JWT' }, origin);
    if (p === '/auth/v1/logout') { S.signedOut++; S.tokens.clear(); return { status: 204, headers: cors(origin), body: '' }; }

    // ---- the scan service
    if (p === '/functions/v1/scan') {
      if (!authed || S.scan401Once) { S.scan401Once = false; return json(401, { error: 'session_expired' }, origin); }
      const b = body || {};
      S.scanCalls.push({ images: (b.images || []).length, firstBytes: (b.images && b.images[0] || '').slice(0, 4), known: b.known, today: b.today, bodyKeys: Object.keys(b) });
      if (S.scanMode === 'quota') return json(429, { error: 'quota_exceeded', used: S.plan.scan_cap, cap: S.plan.scan_cap }, origin);
      if (S.scanMode === 'noaccess') return json(402, { error: 'no_access' }, origin);
      if (S.scanMode === 'down') return json(502, { error: 'upstream_error' }, origin);
      if (S.scanMode === 'unreadable') { S.plan.scans_used++; return json(200, { ok: true, result: { readable: false }, used: S.plan.scans_used, cap: S.plan.scan_cap }, origin); }
      S.plan.scans_used++;
      return json(200, { ok: true, result: CANNED, used: S.plan.scans_used, cap: S.plan.scan_cap }, origin);
    }

    // ---- database
    if (p.startsWith('/rest/v1/')) {
      if (!authed) return json(401, { code: 'PGRST301', message: 'JWT expired', details: null, hint: null }, origin);
      if (p === '/rest/v1/rpc/my_status') return json(200, status(), origin);
      if (p === '/rest/v1/records') {
        const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
        if (method === 'GET') {
          const range = (req.headers()['range'] || '0-999').split('-').map(Number);
          const rows = [...S.records.values()].map(r => ({ id: r.id, data: r.data }));
          return json(200, rows.slice(range[0], range[1] + 1), origin, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/*` });
        }
        if (method === 'POST') {
          const row = Array.isArray(body) ? body[0] : body;
          if (!S.plan.can_write || row.created_by !== USER_ID || row.household_id !== HOUSEHOLD_ID) return rls(origin);
          if (S.records.size >= 5000) return json(400, { code: '23514', message: 'record_limit', details: null, hint: null }, origin);
          S.records.set(row.id, { id: row.id, household_id: row.household_id, data: row.data, created_by: row.created_by });
          return { status: 201, headers: cors(origin), body: '' };
        }
        if (method === 'PATCH') {
          if (!S.plan.can_write || !S.records.has(id)) return json(200, [], origin);
          S.records.get(id).data = body.data;
          return json(200, [{ id }], origin);
        }
        if (method === 'DELETE') {
          if (!S.plan.can_write || !S.records.has(id)) return json(200, [], origin);
          S.records.delete(id);
          return json(200, [{ id }], origin);
        }
      }
    }

    // ---- photos
    if (p.startsWith('/storage/v1/object/')) {
      const rest = p.replace('/storage/v1/object/', '');
      if (rest.startsWith('sign/scans/') && method === 'GET') return bytes(origin);          // opening a signed address
      if (!authed) return json(401, { statusCode: '401', error: 'Unauthorized', message: 'Invalid JWT' }, origin);
      if (rest.startsWith('sign/scans/') && method === 'POST') {
        const path = decodeURIComponent(rest.replace('sign/scans/', ''));
        if (!S.objects.has(path)) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }, origin);
        return json(200, { signedURL: `/object/sign/scans/${rest.replace('sign/scans/', '')}?token=t` }, origin);
      }
      if (rest.startsWith('scans/') && method === 'POST') {
        if (!S.plan.can_write) return json(403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, origin);
        S.objects.set(decodeURIComponent(rest.replace('scans/', '')), true);
        return json(200, { Id: 'obj', Key: rest }, origin);
      }
      if (rest === 'scans' && method === 'DELETE') { (body.prefixes || []).forEach(x => S.objects.delete(x)); return json(200, [], origin); }
      if ((rest.startsWith('scans/') || rest.startsWith('authenticated/scans/')) && method === 'GET') {
        const path = decodeURIComponent(rest.replace('authenticated/', '').replace('scans/', ''));
        return S.objects.has(path) ? bytes(origin) : json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' }, origin);
      }
    }
    return json(404, { message: 'the pretend Supabase does not know ' + p }, origin);
  }
  return { S, answer, status, HOST };
}
