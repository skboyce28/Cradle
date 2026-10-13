-- Cradle, step 3 (optional): feed-due notifications
-- Run after 1-setup.sql and 2-family.sql. Safe to run more than once.
-- Then set up the cradle-notify Edge Function and its schedule: see docs/notifications.md.
--
-- How it works
-- - Each phone that turns notifications on saves a push subscription here (its browser's
--   push address and keys, the phone's time zone, and how early to be told).
-- - Every minute the cradle-notify function asks cradle_push_due() which phones should be
--   told now, sends them a notification, and reports back with cradle_push_result().
-- - The notification keys (VAPID) are created by the function the first time it runs and
--   stored in cradle_push_keys. Only the function can read the private half.

-- 1) Tables
create table if not exists public.cradle_push_subs (
  endpoint      text        primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  household_id  uuid        not null references public.cradle_households(id) on delete cascade,
  p256dh        text        not null,
  auth          text        not null,
  tz            text        not null default 'UTC',
  lead_min      int         not null default 0,
  created_at    timestamptz not null default now(),
  last_sent_due timestamptz,
  fails         int         not null default 0
);
create index if not exists cradle_push_subs_household on public.cradle_push_subs (household_id);
create index if not exists cradle_push_subs_user on public.cradle_push_subs (user_id);
alter table public.cradle_push_subs drop constraint if exists cradle_push_subs_lead;
alter table public.cradle_push_subs add constraint cradle_push_subs_lead check (lead_min in (0, 15, 30));

create table if not exists public.cradle_push_keys (
  id          int         primary key default 1 check (id = 1),
  public_key  text        not null,
  private_jwk jsonb       not null,
  created_at  timestamptz not null default now()
);

-- No direct access from the app at all; everything goes through the functions below.
alter table public.cradle_push_subs enable row level security;
alter table public.cradle_push_keys enable row level security;

-- 2) For the app (signed-in users)

-- Is this Cradle set up for notifications, and is this phone subscribed?
create or replace function public.cradle_push_info(p_endpoint text default null) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'public_key', (select public_key from cradle_push_keys where id = 1),
    'lead_min',   (select lead_min from cradle_push_subs where endpoint = p_endpoint and user_id = auth.uid())
  )
$$;

-- Turn notifications on (or change how early) for this phone
create or replace function public.cradle_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_tz text, p_lead int)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h uuid; z text;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'That push address is not valid'; end if;
  if coalesce(length(p_p256dh), 0) not between 80 and 100 or coalesce(length(p_auth), 0) not between 16 and 30 then raise exception 'Those push keys are not valid'; end if;
  if p_lead not in (0, 15, 30) then raise exception 'Choose when to be told: 0, 15, or 30 minutes before'; end if;
  select household_id into h from cradle_members where user_id = uid order by joined_at desc limit 1;
  if h is null then raise exception 'Join or start a family first'; end if;
  select name into z from pg_timezone_names where name = p_tz;
  if (select count(*) from cradle_push_subs where user_id = uid and endpoint <> p_endpoint) >= 10 then
    delete from cradle_push_subs where endpoint = (select endpoint from cradle_push_subs where user_id = uid order by created_at limit 1);
  end if;
  insert into cradle_push_subs (endpoint, user_id, household_id, p256dh, auth, tz, lead_min)
  values (p_endpoint, uid, h, p_p256dh, p_auth, coalesce(z, 'UTC'), p_lead)
  on conflict (endpoint) do update set user_id = excluded.user_id, household_id = excluded.household_id,
    p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, lead_min = excluded.lead_min, fails = 0;
  return cradle_push_info(p_endpoint);
end $$;

-- Turn notifications off for this phone
create or replace function public.cradle_push_unsubscribe(p_endpoint text) returns json
language plpgsql security definer set search_path = public as $$
begin
  delete from cradle_push_subs where endpoint = p_endpoint and user_id = auth.uid();
  return cradle_push_info(p_endpoint);
end $$;

-- 3) For the cradle-notify function only (service role)

create or replace function public.cradle_push_get_keys() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('public_key', public_key, 'private_jwk', private_jwk) from cradle_push_keys where id = 1
$$;

-- Stores the first key pair; later calls keep the existing one (so phones stay subscribed)
create or replace function public.cradle_push_set_keys(p_public text, p_private jsonb) returns json
language plpgsql security definer set search_path = public as $$
begin
  insert into cradle_push_keys (id, public_key, private_jwk) values (1, p_public, p_private) on conflict (id) do nothing;
  return cradle_push_get_keys();
end $$;

-- Which phones should be told now. Marks each one as told for that due time, so a feed is
-- only announced once per phone. The next feed due = the family's last feed + feed interval.
create or replace function public.cradle_push_due() returns setof json
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    with subs as (
      select s.*,
        coalesce((select case when jsonb_typeof(i.data->'feedInterval') = 'number' then (i.data->>'feedInterval')::numeric
                              when i.data->>'feedInterval' ~ '^[0-9]+(\.[0-9]+)?$' then (i.data->>'feedInterval')::numeric end
                  from cradle_items i where i.household_id = s.household_id and i.id = 'settings' and not i.deleted), 3) as hours,
        (select nullif(trim(i.data->>'babyName'), '') from cradle_items i where i.household_id = s.household_id and i.id = 'settings' and not i.deleted) as baby
      from cradle_push_subs s
      where exists (select 1 from cradle_members m where m.household_id = s.household_id and m.user_id = s.user_id)
    ), lastf as (
      select subs.*, (
        select max(((i.data->>'day') || ' ' || (i.data->>'time'))::timestamp at time zone subs.tz)
        from cradle_items i
        where i.household_id = subs.household_id and i.kind = 'feed' and not i.deleted
          and i.data->>'day' ~ '^\d{4}-\d{2}-\d{2}$' and i.data->>'time' ~ '^\d{2}:\d{2}$'
          and i.data->>'day' >= to_char((now() at time zone subs.tz) - interval '2 days', 'YYYY-MM-DD')
          and coalesce(i.data->>'bath', '') = ''
          and (i.data->>'left' = 'true' or i.data->>'right' = 'true' or i.data->>'wf' = 'true'
               or jsonb_typeof(i.data->'bottle') = 'number' or jsonb_typeof(i.data->'pump') = 'number'
               or (jsonb_typeof(i.data->'mins') = 'number' and (i.data->>'mins')::numeric > 0))
      ) as last_ts
      from subs
    )
    select l.*, l.last_ts + make_interval(mins => round(l.hours * 60)::int) as due
    from lastf l
    where l.last_ts is not null and l.hours between 0.5 and 12
  loop
    if now() >= r.due - make_interval(mins => r.lead_min)
       and now() < r.due + interval '2 hours'
       and r.last_sent_due is distinct from r.due then
      update cradle_push_subs set last_sent_due = r.due where endpoint = r.endpoint;
      return next json_build_object(
        'endpoint', r.endpoint, 'p256dh', r.p256dh, 'auth', r.auth,
        'title', case when r.lead_min > 0 and now() < r.due then '🍼 Feed due in ' || ceil(extract(epoch from r.due - now()) / 60)::int || ' min'
                      else '🍼 Feed due now' end || coalesce(' · ' || r.baby, ''),
        'body', 'Due at ' || lower(to_char(r.due at time zone r.tz, 'FMHH12:MIam')) ||
                '. Last feed was at ' || lower(to_char(r.last_ts at time zone r.tz, 'FMHH12:MIam')) || '.',
        'tag', 'cradle-feed', 'due', r.due);
    end if;
  end loop;
end $$;

-- After sending: 404/410 means the phone unsubscribed, so forget it; other failures are
-- counted, and a phone that fails 20 times in a row is removed.
create or replace function public.cradle_push_result(p_endpoint text, p_status int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status between 200 and 299 then update cradle_push_subs set fails = 0 where endpoint = p_endpoint;
  elsif p_status in (404, 410) then delete from cradle_push_subs where endpoint = p_endpoint;
  else
    update cradle_push_subs set fails = fails + 1 where endpoint = p_endpoint;
    delete from cradle_push_subs where endpoint = p_endpoint and fails >= 20;
  end if;
end $$;

-- 4) Who may call what
grant execute on function public.cradle_push_info(text), public.cradle_push_subscribe(text,text,text,text,int),
  public.cradle_push_unsubscribe(text) to authenticated;
revoke execute on function public.cradle_push_info(text), public.cradle_push_subscribe(text,text,text,text,int),
  public.cradle_push_unsubscribe(text) from anon, public;

revoke execute on function public.cradle_push_get_keys(), public.cradle_push_set_keys(text,jsonb),
  public.cradle_push_due(), public.cradle_push_result(text,int) from anon, authenticated, public;
grant execute on function public.cradle_push_get_keys(), public.cradle_push_set_keys(text,jsonb),
  public.cradle_push_due(), public.cradle_push_result(text,int) to service_role;

-- Record this run for the status page (/status/; see 5-status.sql)
create table if not exists public.cradle_schema_log (script text not null, version text not null, applied_at timestamptz not null default now());
alter table public.cradle_schema_log enable row level security;
insert into public.cradle_schema_log (script, version) values ('3-notifications.sql', '1.16');
