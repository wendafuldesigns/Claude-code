// The Stripe webhook. Stripe calls this when something happens to a subscription. This is the ONLY thing that
// turns a plan on or off. It trusts a message only if its signature checks out against your signing secret,
// and then records it in the database through apply_subscription(), which ignores repeats and out-of-order messages.
import { reply, rpc } from '../_shared/http.js';

const MAX_BODY = 1_000_000;
const TOLERANCE_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = s => new TextEncoder().encode(s);
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stripe signs "<time>.<body>" with your signing secret. The header looks like  t=1700000000,v1=<hex>,v1=<hex>
export async function verifySignature(raw, header, secret, nowSeconds) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(p => p.trim().split('='));
  const t = (parts.find(p => p[0] === 't') || [])[1];
  const sigs = parts.filter(p => p[0] === 'v1').map(p => p[1] || '');
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(nowSeconds - Number(t)) > TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc(t + '.' + raw)));
  return sigs.some(s => sameHex(s, expected));
}

// Stripe's words for a subscription's state, in ours. null means "do not change the plan".
export function planFor(status, deleted) {
  if (deleted) return 'canceled';
  switch (status) {
    case 'active': case 'trialing': return 'active';
    case 'past_due': return 'past_due';
    case 'canceled': case 'unpaid': case 'incomplete_expired': case 'paused': return 'canceled';
    default: return null;   // incomplete: the first payment has not gone through yet
  }
}

export async function handle(req, deps) {
  const env = deps.env || {};
  const f = deps.fetch || fetch;
  const log = deps.log || (() => {});
  const now = deps.now || Date.now;

  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, {});
  if (!env.STRIPE_WEBHOOK_SECRET) return reply(503, { error: 'webhook_off' }, {});
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return reply(413, { error: 'too_big' }, {});
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply(413, { error: 'too_big' }, {});

  if (!(await verifySignature(raw, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, Math.floor(now() / 1000)))) {
    log({ event: 'webhook', ok: false, reason: 'bad_signature' });
    return reply(400, { error: 'bad_signature' }, {});
  }
  let event;
  try { event = JSON.parse(raw); } catch (e) { return reply(400, { error: 'bad_request' }, {}); }
  const obj = event && event.data && event.data.object;
  if (!event || typeof event.id !== 'string' || !obj) return reply(400, { error: 'bad_request' }, {});

  let args = null;
  if (event.type === 'checkout.session.completed') {
    // someone finished paying: link their Stripe customer to the household we named. The subscription messages set the plan.
    if (obj.mode === 'subscription') {
      args = { p_household: UUID.test(obj.client_reference_id || '') ? obj.client_reference_id : null, p_customer: obj.customer || null, p_subscription: typeof obj.subscription === 'string' ? obj.subscription : null, p_status: null, p_period_end: null, p_cancel_at_period_end: null };
    }
  } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    // newer Stripe versions keep the renewal date on the subscription's item, older ones on the subscription itself
    const end = obj.current_period_end ?? (obj.items && obj.items.data && obj.items.data[0] && obj.items.data[0].current_period_end);
    const meta = obj.metadata && obj.metadata.household_id;
    args = {
      p_household: UUID.test(meta || '') ? meta : null,
      p_customer: typeof obj.customer === 'string' ? obj.customer : null,
      p_subscription: obj.id || null,
      p_status: planFor(obj.status, event.type === 'customer.subscription.deleted'),
      p_period_end: typeof end === 'number' ? new Date(end * 1000).toISOString() : null,
      p_cancel_at_period_end: typeof obj.cancel_at_period_end === 'boolean' ? obj.cancel_at_period_end : null,
    };
  }
  if (!args) return reply(200, { received: true, ignored: true }, {});   // a kind of message we do not use

  let r;
  try {
    r = await rpc(f, env, 'apply_subscription', { p_event_id: event.id, p_event_created: Number(event.created) || 0, ...args });
  } catch (e) {
    // a 500 makes Stripe send it again later, which is what we want if the database was unreachable
    log({ event: 'webhook', ok: false, reason: 'database', type: event.type });
    return reply(500, { error: 'try_again' }, {});
  }
  log({ event: 'webhook', ok: true, type: event.type, applied: r && r.applied, reason: r && r.reason });
  return reply(200, { received: true, applied: !!(r && r.applied), reason: r && r.reason }, {});
}
