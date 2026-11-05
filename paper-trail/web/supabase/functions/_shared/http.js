// Small helpers the billing service and the Stripe webhook share.
// (The scan service has its own copy of the same ideas, so it stays one self-contained piece.)

// Which websites may call a function from a browser: only the addresses listed in ALLOWED_ORIGINS.
export function corsHeaders(req, env) {
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

export function reply(status, body, cors) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
}

// Who is this token? Supabase answers, so a made-up or expired token gets nothing.
export async function getUser(f, env, token) {
  try {
    const r = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) {
    return null;
  }
}

// Call one of the database's server-only functions, as the server.
export async function rpc(f, env, name, args) {
  const r = await f(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(name + ' ' + r.status);
  return r.status === 204 ? null : r.json();
}
