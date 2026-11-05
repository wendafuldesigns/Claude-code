// Tests the billing service and the Stripe webhook with stand-ins for Stripe and Supabase. It never touches the network.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle as billing } from '../functions/billing/handler.js';
import { handle as webhook, verifySignature, planFor } from '../functions/stripe-webhook/handler.js';

let passed = 0, failed = 0;
const check = (name, ok, extra) => { if (ok) { passed++; console.log('PASS ' + name); } else { failed++; console.log('FAIL ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); } };

const HOUSEHOLD = '22222222-2222-4222-8222-222222222222';
const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-secret-key',
  STRIPE_SECRET_KEY: 'sk_test_secret123', STRIPE_PRICE_MONTHLY: 'price_month', STRIPE_PRICE_YEARLY: 'price_year',
  SITE_URL: 'https://app.example.com', ALLOWED_ORIGINS: 'https://app.example.com', STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function world(o = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/auth/v1/user')) return o.user === null ? json(401, {}) : json(200, o.user || { id: 'user-1', email: 'wenda@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' });
    if (u.endsWith('/rpc/billing_info')) return o.infoStatus ? json(o.infoStatus, {}) : json(200, o.info === undefined ? { household_id: HOUSEHOLD, plan_status: 'trialing', stripe_customer_id: null, stripe_subscription_id: null } : o.info);
    if (u.endsWith('/rpc/apply_subscription')) return o.applyStatus ? json(o.applyStatus, { message: 'db down' }) : json(200, o.apply || { applied: true, household_id: HOUSEHOLD, plan_status: 'active' });
    if (u === 'https://api.stripe.com/v1/checkout/sessions') return o.stripe ? o.stripe() : json(200, { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    if (u === 'https://api.stripe.com/v1/billing_portal/sessions') return o.stripe ? o.stripe() : json(200, { id: 'bps_1', url: 'https://billing.stripe.com/p/session/abc' });
    throw new Error('unexpected call to ' + u);
  };
  return { f, calls, called: s => calls.filter(c => c.url.includes(s)) };
}
const formOf = c => Object.fromEntries(new URLSearchParams(c.init.body));

// ================= the billing service =================
async function ask(body, o = {}, env = {}) {
  const w = world(o);
  const headers = { 'content-type': 'application/json', origin: 'https://app.example.com' };
  if (o.token !== null) headers.authorization = 'Bearer ' + (o.token || 'user-token');
  const res = await billing(new Request('https://proj.supabase.co/functions/v1/billing', { method: o.method || 'POST', headers, body: o.method === 'OPTIONS' || o.method === 'GET' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), { env: { ...ENV, ...env }, fetch: w.f, log: l => (w.logs = (w.logs || []).concat([l])) });
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { /* no body */ }
  return { res, text, j, w };
}

const co = await ask({ action: 'checkout', plan: 'monthly' });
const sent = co.w.called('checkout/sessions')[0];
const f1 = formOf(sent);
check('checkout hands back Stripe\'s page', co.res.status === 200 && co.j.url === 'https://checkout.stripe.com/c/pay/cs_test_1', co.j);
check('it asks Stripe for a subscription with the monthly price, from the settings', f1.mode === 'subscription' && f1['line_items[0][price]'] === 'price_month' && f1['line_items[0][quantity]'] === '1', f1);
check('the key goes to Stripe in the right header and form type', sent.init.headers.authorization === 'Bearer sk_test_secret123' && sent.init.headers['content-type'] === 'application/x-www-form-urlencoded');
check('the household is named three ways, so the webhook can find it', f1.client_reference_id === HOUSEHOLD && f1['subscription_data[metadata][household_id]'] === HOUSEHOLD && f1['metadata[household_id]'] === HOUSEHOLD, f1);
check('the return addresses come from the settings, not from the app', f1.success_url === 'https://app.example.com/?checkout=success' && f1.cancel_url === 'https://app.example.com/?checkout=canceled');
check('a new customer is created with their confirmed email, and promo codes are allowed', f1.customer_email === 'wenda@example.com' && !('customer' in f1) && f1.allow_promotion_codes === 'true');
check('the secret key never comes back to the app', !/sk_test|service-secret/.test(co.text));
const yearly = await ask({ action: 'checkout', plan: 'yearly' });
check('the yearly price is used when asked for', formOf(yearly.w.called('checkout/sessions')[0])['line_items[0][price]'] === 'price_year');
const odd = await ask({ action: 'checkout', plan: 'price_for_free', price: 'price_cheap', amount: 1, success_url: 'https://evil.example.com' });
const fo = formOf(odd.w.called('checkout/sessions')[0]);
check('the app cannot pick the price, the amount, or where Stripe sends people back', fo['line_items[0][price]'] === 'price_month' && !('amount' in fo) && fo.success_url.startsWith('https://app.example.com/') && !JSON.stringify(fo).includes('price_cheap') && !JSON.stringify(fo).includes('evil'), fo);
const noYear = await ask({ action: 'checkout', plan: 'yearly' }, {}, { STRIPE_PRICE_YEARLY: '' });
check('a plan with no price set up is turned away, and Stripe is not called', noYear.res.status === 400 && noYear.j.error === 'plan_unavailable' && noYear.w.called('stripe.com').length === 0);
const known = await ask({ action: 'checkout' }, { info: { household_id: HOUSEHOLD, plan_status: 'canceled', stripe_customer_id: 'cus_A', stripe_subscription_id: 'sub_old' } });
const fk = formOf(known.w.called('checkout/sessions')[0]);
check('someone who subscribed before comes back as the same Stripe customer, with no second email', fk.customer === 'cus_A' && !('customer_email' in fk));
const dup = await ask({ action: 'checkout' }, { info: { household_id: HOUSEHOLD, plan_status: 'active', stripe_customer_id: 'cus_A', stripe_subscription_id: 'sub_A' } });
check('someone already subscribed cannot start a second subscription', dup.res.status === 409 && dup.j.error === 'already_subscribed' && dup.w.called('stripe.com').length === 0);
const late = await ask({ action: 'checkout' }, { info: { household_id: HOUSEHOLD, plan_status: 'past_due', stripe_customer_id: 'cus_A', stripe_subscription_id: 'sub_A' } });
check('and neither can someone whose payment is late', late.res.status === 409);

const portal = await ask({ action: 'portal' }, { info: { household_id: HOUSEHOLD, plan_status: 'active', stripe_customer_id: 'cus_A', stripe_subscription_id: 'sub_A' } });
const fp = formOf(portal.w.called('billing_portal/sessions')[0]);
check('the manage page is for their own Stripe customer, and sends them back to the app', portal.res.status === 200 && portal.j.url === 'https://billing.stripe.com/p/session/abc' && fp.customer === 'cus_A' && fp.return_url === 'https://app.example.com/', fp);
const noCus = await ask({ action: 'portal' });
check('someone who never subscribed has nothing to manage', noCus.res.status === 409 && noCus.j.error === 'no_customer' && noCus.w.called('stripe.com').length === 0);

const strange = await ask({ action: 'checkout' }, { stripe: () => json(200, { url: 'https://evil.example.com/phish' }) });
check('an address that is not Stripe\'s is never passed on', strange.res.status === 502 && !strange.text.includes('evil'));
const stripeDown = await ask({ action: 'checkout' }, { stripe: () => json(402, { error: { type: 'card_error', code: 'x', message: 'sk_test_secret123 leaked?' } }) });
check('when Stripe says no, the person gets a plain error and no detail', stripeDown.res.status === 502 && stripeDown.j.error === 'upstream_error' && !/sk_test|leaked/.test(stripeDown.text));
check('the log names the kind of problem but not Stripe\'s message', stripeDown.w.logs.some(l => l.ok === false && l.type === 'card_error') && !JSON.stringify(stripeDown.w.logs).includes('leaked'));
const noToken = await ask({ action: 'checkout' }, { token: null });
check('no token: refused', noToken.res.status === 401 && noToken.w.calls.length === 0);
const badToken = await ask({ action: 'checkout' }, { user: null });
check('a token Supabase does not accept: refused before Stripe is called', badToken.res.status === 401 && badToken.w.called('stripe.com').length === 0);
const unconfirmed = await ask({ action: 'checkout' }, { user: { id: 'u', email: 'x@example.com', email_confirmed_at: null } });
check('an unconfirmed email cannot start a subscription', unconfirmed.res.status === 403 && unconfirmed.w.called('stripe.com').length === 0);
const noHousehold = await ask({ action: 'checkout' }, { info: null });
check('someone with no household is refused', noHousehold.res.status === 403);
for (const [label, body] of [['an unknown action', { action: 'refund' }], ['no action', {}], ['not JSON', 'nope'], ['a huge body', { action: 'checkout', pad: 'x'.repeat(5000) }]]) {
  const r = await ask(body);
  check('refused before anything else happens: ' + label, r.res.status === 400 && r.w.calls.length === 0, r.res.status);
}
const off = await ask({ action: 'checkout' }, {}, { STRIPE_SECRET_KEY: '' });
check('billing says it is off when it has not been set up', off.res.status === 503 && off.j.error === 'billing_off' && off.w.calls.length === 0);
const badSite = await ask({ action: 'checkout' }, {}, { SITE_URL: 'javascript:alert(1)' });
check('and when the site address in its settings is not a real web address', badSite.res.status === 503);
const pre = await ask(null, { method: 'OPTIONS' });
check('the app\'s own address may call it, and a plain GET is refused', pre.res.status === 204 && pre.res.headers.get('access-control-allow-origin') === 'https://app.example.com' && (await ask(null, { method: 'GET' })).res.status === 405);

// ================= the Stripe signature =================
const sign = (raw, secret, t) => 'v1=' + crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
const NOW = 1_800_000_000;
const rawBody = '{"id":"evt_1"}';
check('a message signed with the right secret is accepted', await verifySignature(rawBody, `t=${NOW},${sign(rawBody, ENV.STRIPE_WEBHOOK_SECRET, NOW)}`, ENV.STRIPE_WEBHOOK_SECRET, NOW));
check('a different secret is refused', !(await verifySignature(rawBody, `t=${NOW},${sign(rawBody, 'whsec_other', NOW)}`, ENV.STRIPE_WEBHOOK_SECRET, NOW)));
check('a changed body is refused', !(await verifySignature(rawBody + ' ', `t=${NOW},${sign(rawBody, ENV.STRIPE_WEBHOOK_SECRET, NOW)}`, ENV.STRIPE_WEBHOOK_SECRET, NOW)));
check('a changed time is refused', !(await verifySignature(rawBody, `t=${NOW + 1},${sign(rawBody, ENV.STRIPE_WEBHOOK_SECRET, NOW)}`, ENV.STRIPE_WEBHOOK_SECRET, NOW)));
check('an old message is refused, so a copy cannot be replayed later', !(await verifySignature(rawBody, `t=${NOW - 301},${sign(rawBody, ENV.STRIPE_WEBHOOK_SECRET, NOW - 301)}`, ENV.STRIPE_WEBHOOK_SECRET, NOW)) && await verifySignature(rawBody, `t=${NOW - 299},${sign(rawBody, ENV.STRIPE_WEBHOOK_SECRET, NOW - 299)}`, ENV.STRIPE_WEBHOOK_SECRET, NOW));
check('a header with more than one signature works when one matches', await verifySignature(rawBody, `t=${NOW},v1=${'0'.repeat(64)},${sign(rawBody, ENV.STRIPE_WEBHOOK_SECRET, NOW)}`, ENV.STRIPE_WEBHOOK_SECRET, NOW));
check('missing, empty, or garbled headers are refused', !(await verifySignature(rawBody, null, ENV.STRIPE_WEBHOOK_SECRET, NOW)) && !(await verifySignature(rawBody, '', ENV.STRIPE_WEBHOOK_SECRET, NOW)) && !(await verifySignature(rawBody, 'hello', ENV.STRIPE_WEBHOOK_SECRET, NOW)) && !(await verifySignature(rawBody, `t=abc,v1=${'0'.repeat(64)}`, ENV.STRIPE_WEBHOOK_SECRET, NOW)) && !(await verifySignature(rawBody, `t=${NOW}`, ENV.STRIPE_WEBHOOK_SECRET, NOW)));
check('no secret set means nothing is accepted', !(await verifySignature(rawBody, `t=${NOW},${sign(rawBody, '', NOW)}`, '', NOW)));

// ================= what Stripe's words mean =================
check('Stripe statuses become our plan states', planFor('active') === 'active' && planFor('trialing') === 'active' && planFor('past_due') === 'past_due' && planFor('canceled') === 'canceled' && planFor('unpaid') === 'canceled' && planFor('incomplete_expired') === 'canceled' && planFor('paused') === 'canceled');
check('a first payment that has not gone through yet does not switch anything on', planFor('incomplete') === null && planFor('mystery') === null);
check('a deleted subscription is always ended', planFor('active', true) === 'canceled');

// ================= the webhook =================
async function hook(event, o = {}, env = {}) {
  const w = world(o);
  const raw = typeof event === 'string' ? event : JSON.stringify(event);
  const t = Math.floor(Date.parse('2026-11-05T15:00:00Z') / 1000);
  const headers = { 'content-type': 'application/json' };
  if (o.signature !== null) headers['stripe-signature'] = o.signature || `t=${t},${sign(raw, o.secret || ENV.STRIPE_WEBHOOK_SECRET, t)}`;
  const res = await webhook(new Request('https://proj.supabase.co/functions/v1/stripe-webhook', { method: o.method || 'POST', headers, body: o.method === 'GET' ? undefined : raw }), { env: { ...ENV, ...env }, fetch: w.f, now: () => Date.parse('2026-11-05T15:00:00Z'), log: l => (w.logs = (w.logs || []).concat([l])) });
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { /* no body */ }
  return { res, j, w, text };
}
const argsOf = h => JSON.parse(h.w.called('apply_subscription')[0].init.body);
const sub = (over = {}) => ({ id: 'evt_s1', type: 'customer.subscription.updated', created: 1_800_000_100, data: { object: { id: 'sub_A', customer: 'cus_A', status: 'active', cancel_at_period_end: false, current_period_end: 1_803_000_000, metadata: { household_id: HOUSEHOLD }, ...over } } });

const a = await hook(sub());
const ar = argsOf(a);
check('a paid subscription is recorded with its household, customer, and renewal date', a.res.status === 200 && ar.p_event_id === 'evt_s1' && ar.p_household === HOUSEHOLD && ar.p_customer === 'cus_A' && ar.p_subscription === 'sub_A' && ar.p_status === 'active' && ar.p_period_end === new Date(1_803_000_000 * 1000).toISOString() && ar.p_cancel_at_period_end === false && ar.p_event_created === 1_800_000_100, ar);
check('the database call uses the service key', a.w.called('apply_subscription')[0].init.headers.authorization === 'Bearer service-secret-key');
check('the reply says what happened', a.j.received === true && a.j.applied === true);
const newer = await hook(sub({ current_period_end: undefined, items: { data: [{ current_period_end: 1_804_000_000 }] } }));
check('the renewal date is found on the item too (newer Stripe versions)', argsOf(newer).p_period_end === new Date(1_804_000_000 * 1000).toISOString());
const cancelSoon = await hook(sub({ cancel_at_period_end: true }));
check('a cancel at the end of the period is passed on', argsOf(cancelSoon).p_cancel_at_period_end === true && argsOf(cancelSoon).p_status === 'active');
const late2 = await hook(sub({ status: 'past_due' }));
check('a failed payment becomes past due', argsOf(late2).p_status === 'past_due');
const gone = await hook({ ...sub({ status: 'canceled' }), type: 'customer.subscription.deleted' });
check('a deleted subscription ends the plan', argsOf(gone).p_status === 'canceled');
const incomplete = await hook(sub({ status: 'incomplete' }));
check('an unfinished first payment links the customer without changing the plan', argsOf(incomplete).p_status === null && argsOf(incomplete).p_customer === 'cus_A');
const noMeta = await hook(sub({ metadata: {} }));
check('a message without our household note still works (the database finds it by customer)', argsOf(noMeta).p_household === null && argsOf(noMeta).p_customer === 'cus_A');
const evilMeta = await hook(sub({ metadata: { household_id: "1'; drop table households; --" } }));
check('a household note that is not a real id is ignored, not passed on', argsOf(evilMeta).p_household === null);
const done = await hook({ id: 'evt_c1', type: 'checkout.session.completed', created: 1_800_000_050, data: { object: { id: 'cs_1', mode: 'subscription', client_reference_id: HOUSEHOLD, customer: 'cus_A', subscription: 'sub_A', payment_status: 'paid' } } });
const dr = argsOf(done);
check('finishing checkout links the customer and subscription, and leaves the plan to the subscription message', dr.p_household === HOUSEHOLD && dr.p_customer === 'cus_A' && dr.p_subscription === 'sub_A' && dr.p_status === null && dr.p_period_end === null);
const oneOff = await hook({ id: 'evt_c2', type: 'checkout.session.completed', created: 1, data: { object: { id: 'cs_2', mode: 'payment', client_reference_id: HOUSEHOLD, customer: 'cus_B' } } });
check('a one-time payment is not a subscription, and is ignored', oneOff.res.status === 200 && oneOff.j.ignored === true && oneOff.w.called('apply_subscription').length === 0);
const other = await hook({ id: 'evt_x', type: 'invoice.created', created: 1, data: { object: { id: 'in_1' } } });
check('messages we do not use get a calm 200 so Stripe stops sending them', other.res.status === 200 && other.j.ignored === true && other.w.called('apply_subscription').length === 0);
const repeat = await hook(sub(), { apply: { applied: false, reason: 'duplicate' } });
check('a repeat is acknowledged with 200', repeat.res.status === 200 && repeat.j.applied === false && repeat.j.reason === 'duplicate');
const dbDown = await hook(sub(), { applyStatus: 500 });
check('if the database is down it answers 500, so Stripe sends the message again later', dbDown.res.status === 500 && dbDown.w.logs.some(l => l.reason === 'database'));

// ---- the door is locked
const forged = await hook(sub(), { signature: `t=1800000000,v1=${'a'.repeat(64)}` });
check('a message with a wrong signature is refused, and nothing is recorded', forged.res.status === 400 && forged.w.calls.length === 0);
const wrongSecret = await hook(sub(), { secret: 'whsec_attacker' });
check('a message signed with the wrong secret is refused', wrongSecret.res.status === 400 && wrongSecret.w.calls.length === 0);
const unsigned = await hook(sub(), { signature: null });
check('a message with no signature is refused', unsigned.res.status === 400 && unsigned.w.calls.length === 0);
const stale = await hook(sub(), { signature: `t=${Math.floor(Date.parse('2026-11-05T14:00:00Z') / 1000)},${sign(JSON.stringify(sub()), ENV.STRIPE_WEBHOOK_SECRET, Math.floor(Date.parse('2026-11-05T14:00:00Z') / 1000))}` });
check('a correctly signed message that is an hour old is refused', stale.res.status === 400 && stale.w.calls.length === 0);
const notJson = await hook('not json at all');
check('a signed message that is not JSON is refused', notJson.res.status === 400 && notJson.w.calls.length === 0);
const bare = await hook({ foo: 'bar' });
check('and so is one that is not a Stripe event', bare.res.status === 400 && bare.w.calls.length === 0);
const get = await hook(sub(), { method: 'GET' });
check('only POST is allowed', get.res.status === 405);
const noSecret = await hook(sub(), {}, { STRIPE_WEBHOOK_SECRET: '' });
check('with no signing secret set up, it refuses everything', noSecret.res.status === 503 && noSecret.w.calls.length === 0);
const huge = await hook('x'.repeat(1_100_000));
check('a body over a megabyte is refused', huge.res.status === 413 && huge.w.calls.length === 0);
check('no reply ever contains a secret', ![a, forged, dbDown, huge].some(r => /whsec_|sk_test|service-secret/.test(r.text)));

// ================= the one-file versions for the Supabase dashboard =================
const here = path.dirname(fileURLToPath(import.meta.url));
const smoke = which => { try { return JSON.parse(execFileSync('node', ['--experimental-strip-types', '--no-warnings', path.join(here, 'bundle-smoke-payments.mjs'), which], { stdio: 'pipe', encoding: 'utf8' }).trim().split('\n').pop()); } catch (e) { return { error: String(e.stderr || e.message).slice(0, 300) }; } };
let inSync = true;
try { execFileSync('node', [path.join(here, '../../app/bundle-function.mjs'), '--check'], { stdio: 'pipe' }); } catch (e) { inSync = false; }
check('the one-file versions match the source (run app/bundle-function.mjs if this fails)', inSync);
const sb = smoke('billing');
check('the one-file billing service runs on its own and hands back a Stripe page', sb.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(sb.body.url), sb);
const sw = smoke('webhook');
check('the one-file webhook runs on its own and accepts a signed message', sw.status === 200 && sw.body.applied === true, sw);

console.log('\n' + passed + '/' + (passed + failed) + ' passed');
process.exit(failed ? 1 : 0);
