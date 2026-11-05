-- Paper Trail web app: households, records, scan usage, and the rules that keep each family's papers private.
--
-- Run this once in the Supabase SQL editor (or with `supabase db push`). It is safe to read top to bottom.
--
-- How access works
--   * Every person who signs up gets a household of their own and is its owner (the trigger at the bottom).
--   * A record belongs to a household. You can read it if you are a member of that household.
--   * You can add, change, or delete a record only while the household's plan is open: a trial that has not
--     ended, an active subscription, or a payment that is late (past_due). After a trial ends or a subscription
--     is canceled the household can still read and export everything, but not add.
--   * Nobody can change a household's plan, limits, or scan counts from the app. Only the server (service role) can.
--   * Scans are counted and capped by the server through begin_scan(). The app only reads the numbers.

-- ---------- tables ----------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our household' check (char_length(name) <= 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- plan
  plan_status text not null default 'trialing' check (plan_status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  current_period_end timestamptz,
  -- scan limits: a small total during the trial, then a monthly cap
  trial_scan_cap integer not null default 15 check (trial_scan_cap >= 0),
  scan_limit integer not null default 100 check (scan_limit >= 0),
  -- filled in by the payment webhook
  stripe_customer_id text unique,
  stripe_subscription_id text unique
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- the record exactly as the app keeps it: title, date, vendor, total, details, next due, photo ids, and so on
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 65536),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index records_household_idx on public.records (household_id, updated_at desc);

create table public.scan_usage (
  household_id uuid not null references public.households (id) on delete cascade,
  month date not null,
  count integer not null default 0 check (count >= 0),
  primary key (household_id, month)
);

-- ---------- small helpers ----------

create function public.try_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- is the household's plan open for adding and changing things?
create function public.plan_open(h public.households) returns boolean
language sql stable as $$
  select h.plan_status in ('active', 'past_due')
      or (h.plan_status = 'trialing' and h.trial_ends_at > now());
$$;

create function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create function public.can_write(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.household_members m
    join public.households h on h.id = m.household_id
    where m.household_id = hid and m.user_id = auth.uid() and public.plan_open(h)
  );
$$;

-- ---------- row level security ----------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.records enable row level security;
alter table public.scan_usage enable row level security;

-- the app cannot touch households or scan counts directly: it reads them through my_status() below
revoke all on public.households, public.scan_usage from anon, authenticated;
revoke all on public.household_members, public.records from anon, authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.records to authenticated;

create policy members_read on public.household_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_member(household_id));

create policy records_read on public.records
  for select to authenticated
  using (public.is_member(household_id));

create policy records_insert on public.records
  for insert to authenticated
  with check (public.can_write(household_id) and created_by = auth.uid());

create policy records_update on public.records
  for update to authenticated
  using (public.can_write(household_id))
  with check (public.can_write(household_id));

create policy records_delete on public.records
  for delete to authenticated
  using (public.can_write(household_id));

-- ---------- triggers ----------

create function public.touch_record() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.created_at = old.created_at;
  new.created_by = old.created_by;
  return new;
end $$;
create trigger records_touch before update on public.records
  for each row execute function public.touch_record();

-- a household can hold up to 5,000 records
create function public.limit_records() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.records r where r.household_id = new.household_id) >= 5000 then
    raise exception 'record_limit' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger records_limit before insert on public.records
  for each row execute function public.limit_records();

-- when the last person leaves a household (for example an account is deleted), the household and its records go too.
-- Photo files live in Storage, not in the database, so the app removes them first (see docs/DEPLOY.md, deleting an account).
create function public.drop_empty_household() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.households h
  where h.id = old.household_id
    and not exists (select 1 from public.household_members m where m.household_id = old.household_id);
  return old;
end $$;
create trigger household_members_cleanup after delete on public.household_members
  for each row execute function public.drop_empty_household();

-- everyone who signs up gets a household and owns it
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
begin
  insert into public.households (created_by) values (new.id) returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, new.id, 'owner');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- what the app asks the server ----------

-- the signed-in person's household, plan, and scan numbers, in one call
create function public.my_status() returns jsonb
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
    'can_write', public.plan_open(h),
    'scans_used', used,
    'scan_cap', cap
  );
end $$;

-- Used by the scan service only. Checks the plan and the cap, then counts one scan, all in one step so two
-- scans at once cannot both squeeze under the cap. Returns {ok, reason, household_id, used, cap}.
create function public.begin_scan(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.households;
  m date := date_trunc('month', now())::date;
  used integer;
  cap integer;
begin
  select hh.* into h
  from public.households hh
  join public.household_members mm on mm.household_id = hh.id
  where mm.user_id = p_user
  order by mm.created_at
  limit 1
  for update of hh;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_access');
  end if;
  if not public.plan_open(h) then
    return jsonb_build_object('ok', false, 'reason', 'no_access', 'household_id', h.id);
  end if;
  if h.plan_status = 'trialing' then
    select coalesce(sum(u.count), 0) into used from public.scan_usage u where u.household_id = h.id;
    cap := h.trial_scan_cap;
  else
    select coalesce(max(u.count), 0) into used from public.scan_usage u where u.household_id = h.id and u.month = m;
    cap := h.scan_limit;
  end if;
  if used >= cap then
    return jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'household_id', h.id, 'used', used, 'cap', cap);
  end if;
  insert into public.scan_usage (household_id, month, count) values (h.id, m, 1)
  on conflict (household_id, month) do update set count = public.scan_usage.count + 1;
  return jsonb_build_object('ok', true, 'household_id', h.id, 'used', used + 1, 'cap', cap);
end $$;

-- gives a scan back when the read failed on our side
create function public.refund_scan(p_household uuid) returns void
language sql security definer set search_path = '' as $$
  update public.scan_usage
  set count = greatest(count - 1, 0)
  where household_id = p_household and month = date_trunc('month', now())::date;
$$;

-- who may call what
revoke all on function public.begin_scan(uuid), public.refund_scan(uuid) from public, anon, authenticated;
grant execute on function public.begin_scan(uuid), public.refund_scan(uuid) to service_role;

revoke all on function public.my_status() from public, anon;
grant execute on function public.my_status() to authenticated;

revoke all on function public.try_uuid(text), public.is_member(uuid), public.can_write(uuid), public.plan_open(public.households) from public, anon;
grant execute on function public.try_uuid(text), public.is_member(uuid), public.can_write(uuid), public.plan_open(public.households) to authenticated, service_role;

-- ---------- photos ----------
-- Photos live in a private bucket. A photo's path starts with its household's id, so the same membership
-- rules apply: members can look, and people with an open plan can add or remove.

do $do$
begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('scans', 'scans', false, 3145728, array['image/jpeg'])
    on conflict (id) do nothing;

    create policy "scans: members read" on storage.objects
      for select to authenticated
      using (bucket_id = 'scans' and public.is_member(public.try_uuid((storage.foldername(name))[1])));

    create policy "scans: open plans add" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'scans' and public.can_write(public.try_uuid((storage.foldername(name))[1])));

    create policy "scans: open plans remove" on storage.objects
      for delete to authenticated
      using (bucket_id = 'scans' and public.can_write(public.try_uuid((storage.foldername(name))[1])));
  end if;
end $do$;

-- ---------- live updates ----------
-- so a second phone sees a new record without refreshing
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.records;
  end if;
end $do$;
