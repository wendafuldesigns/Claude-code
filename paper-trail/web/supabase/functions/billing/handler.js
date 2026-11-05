// The billing service. A signed-in person asks for one of two things:
//   { action: "checkout", plan: "monthly" | "yearly" }  ->  { url }  a Stripe page where they start a subscription
//   { action: "portal" }                                 ->  { url }  a Stripe page where they update a card or cancel
//
// What it never does: turn a plan on. A plan only turns on when Stripe's webhook says a payment happened.
// What the app cannot choose: the price (it is in this service's settings), the amount, or where Stripe sends people back to.
import { corsHeaders, reply, getUser, rpc } from '../_shared/http.js';

const STRIPE = 'https://api.stripe.com/v1';

// Stripe takes plain form fields, and nested ones are written like line_items[0][price]
const form = fields => new URLSearchParams(fields).toString();

async function stripe(f, env, path, fields) {
  const r = await f(STRIPE + path, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
    body: form(fields),
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* no body */ }
  return { ok: r.ok, status: r.status, data };
}
// the address Stripe gives back must be one of Stripe's own
const stripeUrl = u => { try { const h = new URL(u); return h.protocol === 'https:' && /(^|\.)stripe\.com$/.test(h.hostname) ? u : null; } catch (e) { return null; } };

export async function handle(req, deps) {
  const env = deps.env || {};
  const f = deps.fetch || fetch;
  const log = deps.log || (() => {});
  const cors = corsHeaders(req, env);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, cors);

  const site = String(env.SITE_URL || '').replace(/\/+$/, '');
  if (!env.STRIPE_SECRET_KEY || !/^(https:\/\/[^/\s]+|http:\/\/localhost(:\d+)?)$/.test(site)) return reply(503, { error: 'billing_off' }, cors);

  const token = (/^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '') || [])[1];
  if (!token) return reply(401, { error: 'session_expired' }, cors);
  let body;
  try {
    const text = await req.text();
    if (text.length > 2000) return reply(400, { error: 'bad_request' }, cors);
    body = JSON.parse(text);
  } catch (e) {
    return reply(400, { error: 'bad_request' }, cors);
  }
  const action = body && body.action;
  if (action !== 'checkout' && action !== 'portal') return reply(400, { error: 'bad_request' }, cors);

  const user = await getUser(f, env, token);
  if (!user) return reply(401, { error: 'session_expired' }, cors);
  if (!user.email_confirmed_at) return reply(403, { error: 'no_access' }, cors);

  let info;
  try { info = await rpc(f, env, 'billing_info', { p_user: user.id }); } catch (e) { return reply(503, { error: 'upstream_error' }, cors); }
  if (!info) return reply(403, { error: 'no_access' }, cors);

  let made;
  if (action === 'checkout') {
    const price = body.plan === 'yearly' ? env.STRIPE_PRICE_YEARLY : env.STRIPE_PRICE_MONTHLY;
    if (!price) return reply(400, { error: 'plan_unavailable' }, cors);
    // one subscription at a time: someone who is already subscribed manages it instead
    if (info.stripe_subscription_id && (info.plan_status === 'active' || info.plan_status === 'past_due')) return reply(409, { error: 'already_subscribed' }, cors);
    const fields = {
      mode: 'subscription',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      success_url: site + '/?checkout=success',
      cancel_url: site + '/?checkout=canceled',
      client_reference_id: info.household_id,
      allow_promotion_codes: 'true',
      'subscription_data[metadata][household_id]': info.household_id,
      'metadata[household_id]': info.household_id,
    };
    if (info.stripe_customer_id) fields.customer = info.stripe_customer_id; else fields.customer_email = user.email;
    made = await stripe(f, env, '/checkout/sessions', fields);
  } else {
    if (!info.stripe_customer_id) return reply(409, { error: 'no_customer' }, cors);
    made = await stripe(f, env, '/billing_portal/sessions', { customer: info.stripe_customer_id, return_url: site + '/' });
  }

  const url = made.ok && made.data ? stripeUrl(made.data.url) : null;
  if (!url) {
    // log what kind of problem it was, never the details Stripe sent back
    log({ event: 'billing', action, ok: false, status: made.status, type: made.data && made.data.error && made.data.error.type, code: made.data && made.data.error && made.data.error.code });
    return reply(502, { error: 'upstream_error' }, cors);
  }
  log({ event: 'billing', action, ok: true });
  return reply(200, { url }, cors);
}
