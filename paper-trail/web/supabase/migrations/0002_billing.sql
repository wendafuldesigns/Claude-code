-- Paper Trail web app: subscriptions.
--
-- Run this after 0001_init.sql. It adds what the payment webhook needs: a place to record each subscription's state,
-- a list of Stripe messages already handled (so a repeat does nothing), and a bigger my_status() for the account screen.
--
-- How a plan turns on
--   * Stripe sends the webhook a signed message when someone pays, when a payment fails, and when a subscription ends.
--   * The webhook checks the signature, then calls apply_subscription() below. Only the server can call it.
--   * A plan only changes when Stripe says so. Nothing the person does in the browser can switch it on.

alter table public.households
  add column cancel_at_period_end boolean not null default false,
  add column plan_event_at bigint not null default 0;   -- when (Stripe's clock) the last message we acted on was made

-- every Stripe message we have acted on, so a repeat is ignored
create table public.stripe_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ---------- what the account screen shows ----------

create or replace function public.my_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  h public.households;
  used integer;
  cap integer;
begin
  if uid is null then
    return null;
  end if;
  select hh.* into h
  from public.households hh
  join public.household_members mm on mm.household_id = hh.id
  where mm.user_id = uid
  order by mm.created_at
  limit 1;
  if not found then
    return null;
  end if;
  if h.plan_status = 'trialing' then
    select coalesce(sum(u.count), 0) into used from public.scan_usage u where u.household_id = h.id;
    cap := h.trial_scan_cap;
  else
    select coalesce(max(u.count), 0) into used
    from public.scan_usage u where u.household_id = h.id and u.month = date_trunc('month', now())::date;
    cap := h.scan_limit;
  end if;
  return jsonb_build_object(
    'household_id', h.id,
    'name', h.name,
    'plan_status', h.plan_status,
    'trial_ends_at', h.trial_ends_at,
    'current_period_end', h.current_period_end,
    'cancel_at_period_end', h.cancel_at_period_end,
    'has_customer', h.stripe_customer_id is not null,
    'can_write', public.plan_open(h),
    'scans_used', used,
    'scan_cap', cap
  );
end $$;
revoke all on function public.my_status() from public, anon;
grant execute on function public.my_status() to authenticated;

-- ---------- for the billing service ----------

-- who is this person, and where do they stand? (server only)
create function public.billing_info(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  h public.households;
begin
  select hh.* into h
  from public.households hh
  join public.household_members mm on mm.household_id = hh.id
  where mm.user_id = p_user
  order by mm.created_at
  limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'household_id', h.id,
    'plan_status', h.plan_status,
    'stripe_customer_id', h.stripe_customer_id,
    'stripe_subscription_id', h.stripe_subscription_id
  );
end $$;

-- ---------- for the webhook ----------

-- Records what Stripe says about a subscription. Safe to call twice with the same message, and safe when messages
-- arrive out of order. Returns {applied, reason, household_id, plan_status}.
--   p_status is one of active, past_due, canceled, or null (null only links the customer, without changing the plan)
create function public.apply_subscription(
  p_event_id text,
  p_event_created bigint,
  p_household uuid,
  p_customer text,
  p_subscription text,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.households;
  seen integer;
begin
  if p_status is not null and p_status not in ('active', 'past_due', 'canceled') then
    raise exception 'bad status %', p_status;
  end if;

  insert into public.stripe_events (event_id) values (p_event_id) on conflict do nothing;
  get diagnostics seen = row_count;
  if seen = 0 then
    return jsonb_build_object('applied', false, 'reason', 'duplicate');
  end if;

  -- find the household: the one we named when the checkout was made, else by what Stripe already knows about it
  select * into h from public.households where id = p_household;
  if not found and p_subscription is not null then
    select * into h from public.households where stripe_subscription_id = p_subscription;
  end if;
  if not found and p_customer is not null then
    select * into h from public.households where stripe_customer_id = p_customer;
  end if;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'unknown_household');
  end if;

  if p_event_created < h.plan_event_at then
    return jsonb_build_object('applied', false, 'reason', 'stale', 'household_id', h.id);
  end if;

  -- an old subscription ending must not switch off a newer one
  if p_status = 'canceled' and p_subscription is not null and h.stripe_subscription_id is not null and h.stripe_subscription_id <> p_subscription then
    return jsonb_build_object('applied', false, 'reason', 'other_subscription', 'household_id', h.id);
  end if;

  update public.households set
    stripe_customer_id = coalesce(p_customer, stripe_customer_id),
    stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id),
    plan_status = coalesce(p_status, plan_status),
    current_period_end = coalesce(p_period_end, current_period_end),
    cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
    plan_event_at = greatest(plan_event_at, p_event_created)
  where id = h.id
  returning * into h;

  return jsonb_build_object('applied', true, 'household_id', h.id, 'plan_status', h.plan_status);
end $$;

revoke all on function public.billing_info(uuid), public.apply_subscription(text, bigint, uuid, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.billing_info(uuid), public.apply_subscription(text, bigint, uuid, text, text, text, timestamptz, boolean) to service_role;
