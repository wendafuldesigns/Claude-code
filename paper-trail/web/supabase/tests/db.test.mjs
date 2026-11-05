// Tests the real migration (0001_init.sql) on an in-memory Postgres (PGlite).
// A small prelude stands in for the parts Supabase provides: the auth and storage schemas, the API roles,
// and the default permissions Supabase gives new tables and functions.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(process.env.MIGRATION || path.join(here, '../migrations/0001_init.sql'), 'utf8');

const prelude = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end $$;
create publication supabase_realtime;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
-- Supabase gives the API roles full access to new public tables and functions, and relies on row level security
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const db = new PGlite();
await db.exec(prelude);
await db.exec(migration);

let passed = 0, failed = 0;
const check = (name, ok, extra) => {
  if (ok) { passed++; console.log('PASS ' + name); } else { failed++; console.log('FAIL ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); }
};
// run steps as a signed-in person (or another role), in one transaction that commits when it finishes
async function as(uid, steps, role = 'authenticated') {
  return db.transaction(async tx => {
    await tx.query(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    return steps(tx);
  });
}
async function fails(promise, pattern) {
  try { await promise; return { failed: false }; } catch (e) { return { failed: true, message: String(e.message || e), matches: pattern ? pattern.test(String(e.message || e)) : true }; }
}

// ---- two families sign up
const ana = (await db.query(`insert into auth.users (email) values ('ana@example.com') returning id`)).rows[0].id;
const ben = (await db.query(`insert into auth.users (email) values ('ben@example.com') returning id`)).rows[0].id;
const sA = await as(ana, async tx => (await tx.query('select public.my_status() as s')).rows[0].s);
const sB = await as(ben, async tx => (await tx.query('select public.my_status() as s')).rows[0].s);
const hidA = sA.household_id, hidB = sB.household_id;

check('signing up creates a household of your own', !!hidA && !!hidB && hidA !== hidB);
check('each person is the owner of their household', (await db.query(`select count(*)::int as n from public.household_members where role = 'owner'`)).rows[0].n === 2);
check('a new household is on a 14 day trial', sA.plan_status === 'trialing' && sA.can_write === true && Math.abs(new Date(sA.trial_ends_at) - Date.now() - 14 * 864e5) < 60e3, sA);
check('the trial starts with 0 of 15 scans used', sA.scans_used === 0 && sA.scan_cap === 15, sA);
check('my_status says nothing when nobody is signed in', (await as('', async tx => (await tx.query('select public.my_status() as s')).rows[0].s)) === null);

// ---- records stay inside the household
const recA = { title: 'Oil change', total: 79.99 };
const idA = (await as(ana, async tx => (await tx.query(`insert into public.records (household_id, data, created_by) values ($1, $2, $3) returning id`, [hidA, recA, ana])).rows[0].id));
check('a member can add a record to their household', !!idA);
check('and read it back', (await as(ana, async tx => (await tx.query('select data from public.records')).rows)).map(r => r.data.title).join() === 'Oil change');
check('another family sees none of it', (await as(ben, async tx => (await tx.query('select * from public.records')).rows)).length === 0);
const sneak = await fails(as(ben, tx => tx.query(`insert into public.records (household_id, data, created_by) values ($1, '{}', $2)`, [hidA, ben])), /row-level security/);
check('another family cannot add a record to yours', sneak.failed && sneak.matches, sneak);
const upd = await as(ben, async tx => (await tx.query(`update public.records set data = '{"title":"hacked"}' where id = $1 returning id`, [idA])).rows);
check('another family cannot change your record', upd.length === 0);
const del = await as(ben, async tx => (await tx.query(`delete from public.records where id = $1 returning id`, [idA])).rows);
check('or delete it', del.length === 0);
const forge = await fails(as(ana, tx => tx.query(`insert into public.records (household_id, data, created_by) values ($1, '{}', $2)`, [hidA, ben])), /row-level security/);
check('you cannot add a record in someone else\'s name', forge.failed && forge.matches, forge);
const move = await fails(as(ben, tx => tx.query(`update public.records set household_id = $1 where id = $2`, [hidB, idA])));
check('and a record cannot be moved into another household', (await db.query('select household_id from public.records where id = $1', [idA])).rows[0].household_id === hidA);
const anaEdit = await as(ana, async tx => (await tx.query(`update public.records set data = '{"title":"Oil change","total":80}', created_by = $2, created_at = '2000-01-01' where id = $1 returning updated_at, created_by, created_at`, [idA, ben])).rows[0]);
check('editing your own record works, and it cannot rewrite who made it or when', !!anaEdit && anaEdit.created_by === ana && new Date(anaEdit.created_at).getFullYear() !== 2000, anaEdit);
check('updated_at moves when a record changes', new Date(anaEdit.updated_at) >= new Date(Date.now() - 60e3));

// ---- size limits
const big = await fails(as(ana, tx => tx.query(`insert into public.records (household_id, data, created_by) values ($1, $2, $3)`, [hidA, { notes: 'x'.repeat(70000) }, ana])), /check/i);
check('a record bigger than 64 KB is refused', big.failed && big.matches, big);
const notObj = await fails(as(ana, tx => tx.query(`insert into public.records (household_id, data, created_by) values ($1, '[1,2]', $2)`, [hidA, ana])), /check/i);
check('a record that is not an object is refused', notObj.failed && notObj.matches, notObj);
await db.exec(`insert into public.records (household_id, data) select '${hidB}', '{}'::jsonb from generate_series(1, 5000)`);
const cap = await fails(as(ben, tx => tx.query(`insert into public.records (household_id, data, created_by) values ($1, '{}', $2)`, [hidB, ben])), /record_limit/);
check('a household stops at 5,000 records', cap.failed && cap.matches, cap);
await db.exec(`delete from public.records where household_id = '${hidB}'`);

// ---- the app cannot touch plans, limits, or counts
for (const [label, sql] of [
  ['read the households table', 'select * from public.households'],
  ['read scan counts', 'select * from public.scan_usage'],
  ['upgrade its own plan', `update public.households set plan_status = 'active'`],
  ['raise its own scan cap', `update public.households set scan_limit = 100000`],
  ['write its own scan count', `insert into public.scan_usage (household_id, month, count) values ('${hidA}', '2020-01-01', 0)`],
  ['add itself to another household', `insert into public.household_members (household_id, user_id) values ('${hidB}', '${ana}')`],
]) {
  const r = await fails(as(ana, tx => tx.query(sql)), /permission denied/);
  check('a signed-in person cannot ' + label, r.failed && r.matches, r);
}
const memberRows = await as(ana, async tx => (await tx.query('select household_id from public.household_members')).rows);
check('you can see your own membership and nobody else\'s', memberRows.length === 1 && memberRows[0].household_id === hidA);
const anonRead = await fails(as('', tx => tx.query('select * from public.records'), 'anon'), /permission denied/);
check('someone who is not signed in cannot read records', anonRead.failed && anonRead.matches, anonRead);
const anonCall = await fails(as('', tx => tx.query('select public.my_status()'), 'anon'), /permission denied/);
check('or ask for a status', anonCall.failed && anonCall.matches, anonCall);

// ---- plans: who can add, who can only look
async function setPlan(hid, sql) { await db.exec(`update public.households set ${sql} where id = '${hid}'`); }
async function canAdd(uid, hid) {
  const r = await fails(as(uid, tx => tx.query(`insert into public.records (household_id, data, created_by) values ($1, '{}', $2)`, [hid, uid])));
  if (!r.failed) await db.exec(`delete from public.records where household_id = '${hid}' and data = '{}'::jsonb`);
  return !r.failed;
}
await setPlan(hidA, `plan_status = 'trialing', trial_ends_at = now() - interval '1 day'`);
check('after the trial ends you can still read', (await as(ana, async tx => (await tx.query('select 1 from public.records')).rows)).length === 1);
check('but you cannot add', (await canAdd(ana, hidA)) === false);
const expiredEdit = await as(ana, async tx => (await tx.query(`update public.records set data = '{"title":"x"}' returning id`)).rows);
check('or change a record', expiredEdit.length === 0);
const expiredDel = await as(ana, async tx => (await tx.query(`delete from public.records returning id`)).rows);
check('or delete one', expiredDel.length === 0);
check('my_status says the plan is closed', (await as(ana, async tx => (await tx.query('select public.my_status() as s')).rows[0].s)).can_write === false);
await setPlan(hidA, `plan_status = 'active', current_period_end = now() + interval '30 days'`);
check('an active subscription can add', (await canAdd(ana, hidA)) === true);
await setPlan(hidA, `plan_status = 'past_due'`);
check('a late payment can still add, while it is sorted out', (await canAdd(ana, hidA)) === true);
await setPlan(hidA, `plan_status = 'canceled'`);
check('a canceled subscription cannot add', (await canAdd(ana, hidA)) === false);
check('but can still read everything, to export it', (await as(ana, async tx => (await tx.query('select 1 from public.records')).rows)).length === 1);

// ---- scans: the server counts them and holds the cap
const scan = async uid => (await as(null, async tx => (await tx.query('select public.begin_scan($1) as r', [uid])).rows[0].r, 'service_role'));
const noCall = await fails(as(ana, tx => tx.query('select public.begin_scan($1)', [ana])), /permission denied/);
check('a signed-in person cannot call begin_scan themselves', noCall.failed && noCall.matches, noCall);
const noRefund = await fails(as(ana, tx => tx.query('select public.refund_scan($1)', [hidA])), /permission denied/);
check('or refund a scan', noRefund.failed && noRefund.matches, noRefund);
await setPlan(hidB, `plan_status = 'trialing', trial_ends_at = now() + interval '5 days', trial_scan_cap = 3`);
const t = [await scan(ben), await scan(ben), await scan(ben), await scan(ben)];
check('a trial gets its small total of scans', t[0].ok && t[1].ok && t[2].ok && t[2].used === 3 && t[2].cap === 3, t);
check('and then the next one is turned away', t[3].ok === false && t[3].reason === 'quota_exceeded' && t[3].used === 3, t[3]);
check('the numbers show up in my_status', (await as(ben, async tx => (await tx.query('select public.my_status() as s')).rows[0].s)).scans_used === 3);
await as(null, tx => tx.query('select public.refund_scan($1)', [hidB]), 'service_role');
check('a refunded scan can be used again', (await scan(ben)).ok === true);
await setPlan(hidB, `plan_status = 'active', scan_limit = 2`);
await db.exec(`delete from public.scan_usage where household_id = '${hidB}'`);
await db.exec(`insert into public.scan_usage (household_id, month, count) values ('${hidB}', (date_trunc('month', now()) - interval '1 month')::date, 2)`);
const m = [await scan(ben), await scan(ben), await scan(ben)];
check('an active plan gets a fresh monthly cap, and last month does not count', m[0].ok && m[1].ok && m[2].ok === false && m[2].reason === 'quota_exceeded', m);
await setPlan(hidB, `plan_status = 'canceled'`);
check('a canceled plan cannot scan', (await scan(ben)).reason === 'no_access');
await setPlan(hidB, `plan_status = 'trialing', trial_ends_at = now() - interval '1 hour'`);
check('an ended trial cannot scan', (await scan(ben)).reason === 'no_access');
check('someone with no household cannot scan', (await scan('00000000-0000-0000-0000-000000000000')).reason === 'no_access');

// ---- photos
await setPlan(hidA, `plan_status = 'active'`);
await setPlan(hidB, `plan_status = 'active'`);
const putA = await fails(as(ana, tx => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('scans', $1, $2)`, [hidA + '/one.jpg', ana])));
check('a member can add a photo under their household', !putA.failed, putA);
const putWrong = await fails(as(ana, tx => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('scans', $1, $2)`, [hidB + '/two.jpg', ana])), /row-level security/);
check('but not under another household', putWrong.failed && putWrong.matches, putWrong);
const putJunk = await fails(as(ana, tx => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('scans', 'not-a-household/x.jpg', $1)`, [ana])), /row-level security/);
check('or under a path that is not a household', putJunk.failed && putJunk.matches, putJunk);
const putOther = await fails(as(ana, tx => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('other', $1, $2)`, [hidA + '/x.jpg', ana])));
check('or into some other bucket', putOther.failed);
check('another family cannot see the photo', (await as(ben, async tx => (await tx.query(`select name from storage.objects where bucket_id = 'scans'`)).rows)).length === 0);
check('the owner can', (await as(ana, async tx => (await tx.query(`select name from storage.objects where bucket_id = 'scans'`)).rows)).length === 1);
const delOther = await as(ben, async tx => (await tx.query(`delete from storage.objects where bucket_id = 'scans' returning name`)).rows);
check('another family cannot delete it', delOther.length === 0);
await setPlan(hidA, `plan_status = 'canceled'`);
const putClosed = await fails(as(ana, tx => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('scans', $1, $2)`, [hidA + '/three.jpg', ana])), /row-level security/);
check('a closed plan cannot add photos', putClosed.failed && putClosed.matches, putClosed);
check('but can still look at them', (await as(ana, async tx => (await tx.query(`select name from storage.objects where bucket_id = 'scans'`)).rows)).length === 1);
await setPlan(hidA, `plan_status = 'active'`);
const delOwn = await as(ana, async tx => (await tx.query(`delete from storage.objects where bucket_id = 'scans' returning name`)).rows);
check('an open plan can delete its own photo', delOwn.length === 1);
const bucket = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'scans'`)).rows[0];
check('the photo bucket is private, small-file, JPEG only', bucket && bucket.public === false && Number(bucket.file_size_limit) <= 5 * 1024 * 1024 && bucket.allowed_mime_types.join() === 'image/jpeg', bucket);

// ---- live updates and cleanup
check('records are in the live updates feed', (await db.query(`select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'records'`)).rows.length === 1);
await db.exec(`insert into public.records (household_id, data) values ('${hidB}', '{}')`);
await db.exec(`delete from auth.users where id = '${ben}'`);
const gone = (await db.query(`select (select count(*)::int from public.households where id = '${hidB}') as h, (select count(*)::int from public.records where household_id = '${hidB}') as r, (select count(*)::int from public.scan_usage where household_id = '${hidB}') as u`)).rows[0];
check('deleting a person removes their household, records, and scan counts', gone.h === 0 && gone.r === 0 && gone.u === 0, gone);
check('and leaves the other family alone', (await db.query(`select count(*)::int as n from public.records where household_id = '${hidA}'`)).rows[0].n === 1);

console.log('\n' + passed + '/' + (passed + failed) + ' passed');
process.exit(failed ? 1 : 0);
