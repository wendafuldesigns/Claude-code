// Loads the one-file billing service and webhook the way Supabase would (with Deno's start function stubbed), sends one
// request through each, and prints what came back. payments.test.mjs runs this.
import crypto from 'node:crypto';
const env = {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_MONTHLY: 'price_m',
  SITE_URL: 'https://app.example.com', ALLOWED_ORIGINS: 'https://app.example.com', STRIPE_WEBHOOK_SECRET: 'whsec_x',
};
globalThis.Deno = { env: { toObject: () => env }, serve: h => { globalThis.__handler = h; } };
const j = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async url => {
  const u = String(url);
  if (u.endsWith('/auth/v1/user')) return j(200, { id: 'u1', email: 'a@example.com', email_confirmed_at: 'x' });
  if (u.endsWith('/rpc/billing_info')) return j(200, { household_id: 'h1', plan_status: 'trialing', stripe_customer_id: null, stripe_subscription_id: null });
  if (u.endsWith('/rpc/apply_subscription')) return j(200, { applied: true });
  if (u.includes('checkout/sessions')) return j(200, { url: 'https://checkout.stripe.com/c/pay/x' });
  return j(500, {});
};
const which = process.argv[2];
await import(which === 'billing' ? '../billing-function-single-file.ts' : '../stripe-webhook-function-single-file.ts');
let res;
if (which === 'billing') {
  res = await globalThis.__handler(new Request('https://x/billing', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'checkout' }) }));
} else {
  const raw = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', created: 1, data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: {} } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  res = await globalThis.__handler(new Request('https://x/hook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: raw }));
}
console.log(JSON.stringify({ status: res.status, body: await res.json() }));
