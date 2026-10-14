-- Cradle, step 7 (optional): Owlet Dream Sock sleep, for families who track sleep
-- Run after 1-setup.sql and 2-family.sql. Then deploy the cradle-owlet Edge Function and run
-- 8-owlet-schedule.sql. See docs/owlet.md. Safe to rerun.
--
-- How it's kept safe:
--   - The Owlet password is used once, by the Edge Function, to sign in. It is never stored.
--   - What's stored is Owlet's sign-in token, encrypted (AES-GCM) with a key that exists only in
--     the Edge Function's secrets (CRADLE_OWLET_KEY), never in this database.
--   - The app can't read this table at all. It sees only the sock's name, whether the baby is
--     asleep or awake, and when it was last checked, through cradle_owlet_status().
--   - Heart rate and oxygen are never read into, or stored in, Cradle.
--   - Only families that require two-step sign-in can connect a sock (v1.36). If the owner turns
--     that off later, checks pause (the token stays) until it's back on.
--   - Owlet has no public API; this uses the same calls as Owlet's app (as the open-source
--     pyowletapi library does), so it can stop working if Owlet changes them.

create table if not exists public.cradle_owlet (
  household_id    uuid primary key references public.cradle_households(id) on delete cascade,
  connected_by    uuid references auth.users(id) on delete set null,
  account_hint    text,                      -- the Owlet email, masked: s•••@gmail.com
  region          text not null default 'world',
  dsn             text not null,             -- the sock's serial number
  sock_name       text,
  tz              text not null default 'UTC',
  enc_refresh     text not null,             -- encrypted; the key is only in the Edge Function
  enc_access      text,
  access_exp      timestamptz,
  state           text not null default 'unknown', -- asleep, awake, off, charging, unknown
  state_since     timestamptz,
  pend_state      text,                      -- a change seen but not yet held long enough
  pend_since      timestamptz,
  open_item       text,                      -- the cradle_items id of the sleep in progress
  battery         int,
  polled_at       timestamptz,               -- last check started
  ok_at           timestamptz,               -- last check that reached the sock
  error           text,
  needs_reconnect boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.cradle_owlet drop constraint if exists cradle_owlet_check;
alter table public.cradle_owlet add constraint cradle_owlet_check check (
  region in ('world', 'europe') and state in ('asleep', 'awake', 'off', 'charging', 'unknown', 'unsupported')
  and length(enc_refresh) < 8000 and (enc_access is null or length(enc_access) < 8000));
create table if not exists public.cradle_owlet_tries (user_id uuid not null, at timestamptz not null default now());
create index if not exists cradle_owlet_tries_user on public.cradle_owlet_tries (user_id, at);
revoke all on public.cradle_owlet, public.cradle_owlet_tries from anon, authenticated;
alter table public.cradle_owlet enable row level security;
alter table public.cradle_owlet_tries enable row level security;

-- What the app may see (members of the family)
create or replace function public.cradle_owlet_status(p_h uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare r cradle_owlet; req boolean;
begin
  if not exists (select 1 from cradle_members where household_id = p_h and user_id = auth.uid()) then raise exception 'not a member'; end if;
  req := coalesce((select require_mfa from cradle_households where id = p_h), false);
  select * into r from cradle_owlet where household_id = p_h;
  if not found then return json_build_object('connected', false, 'family_mfa', req); end if;
  -- the sock's state is the baby's, like the log: only for sign-ins that pass the family's rule
  if not cradle_mfa_ok(p_h) then return json_build_object('connected', true, 'locked', true, 'family_mfa', req, 'paused', not req); end if;
  return json_build_object('connected', true, 'family_mfa', req, 'paused', not req, 'sock', r.sock_name, 'account', r.account_hint, 'region', r.region,
    'state', r.state, 'since', r.state_since, 'battery', r.battery, 'checked', r.ok_at, 'polled', r.polled_at,
    'problem', r.error, 'reconnect', r.needs_reconnect,   -- not "error": the app treats that as a failed call
    'by', (select email from cradle_members where household_id = p_h and user_id = r.connected_by limit 1));
end $$;

-- Before the Edge Function signs in to Owlet for someone: a member, past the code step if needed,
-- and at most 10 tries an hour
create or replace function public.cradle_owlet_check(p_h uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from cradle_members where household_id = p_h and user_id = auth.uid()) then raise exception 'not a member'; end if;
  if not coalesce((select require_mfa from cradle_households where id = p_h), false) then
    raise exception 'Your family must require two-step sign-in to connect a Dream Sock. The family owner can turn it on in Family.';
  end if;
  perform cradle_mfa_check(p_h);
  if (select count(*) from cradle_owlet_tries where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many tries. Wait an hour and try again.';
  end if;
  insert into cradle_owlet_tries (user_id) values (auth.uid());
  delete from cradle_owlet_tries where at < now() - interval '1 day';
  return json_build_object('user', auth.uid(), 'household', p_h);
end $$;

create or replace function public.cradle_owlet_disconnect(p_h uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from cradle_members where household_id = p_h and user_id = auth.uid()) then raise exception 'not a member'; end if;
  perform cradle_mfa_check(p_h);
  delete from cradle_owlet where household_id = p_h;
  return json_build_object('connected', false);
end $$;

-- The Edge Function only (service role) from here down

create or replace function public.cradle_owlet_save(p_h uuid, p_user uuid, p_hint text, p_region text, p_dsn text, p_name text,
  p_tz text, p_enc_refresh text, p_enc_access text, p_access_exp timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare tz text := coalesce(nullif(p_tz, ''), 'UTC');
begin
  begin perform now() at time zone tz; exception when others then tz := 'UTC'; end;
  insert into cradle_owlet (household_id, connected_by, account_hint, region, dsn, sock_name, tz, enc_refresh, enc_access, access_exp)
  values (p_h, p_user, left(p_hint, 80), p_region, left(p_dsn, 64), left(p_name, 80), tz, p_enc_refresh, p_enc_access, p_access_exp)
  on conflict (household_id) do update set connected_by = excluded.connected_by, account_hint = excluded.account_hint,
    region = excluded.region, dsn = excluded.dsn, sock_name = excluded.sock_name, tz = excluded.tz,
    enc_refresh = excluded.enc_refresh, enc_access = excluded.enc_access, access_exp = excluded.access_exp,
    state = 'unknown', state_since = null, pend_state = null, pend_since = null, open_item = null,
    error = null, needs_reconnect = false, polled_at = null;
end $$;

-- Families to check now (each at most once every 50 seconds); claims them so overlapping runs skip them
create or replace function public.cradle_owlet_due() returns json
language sql security definer set search_path = public as $$
  with d as (
    update cradle_owlet o set polled_at = now()
    where not needs_reconnect and (polled_at is null or polled_at < now() - interval '50 seconds')
      and coalesce((select h.require_mfa from cradle_households h where h.id = o.household_id), false)   -- paused otherwise
    returning household_id, region, dsn, enc_refresh, enc_access, access_exp)
  select coalesce(json_agg(d), '[]'::json) from d
$$;

create or replace function public.cradle_owlet_tokens(p_h uuid, p_enc_refresh text, p_enc_access text, p_access_exp timestamptz) returns void
language sql security definer set search_path = public as $$
  update cradle_owlet set enc_refresh = coalesce(p_enc_refresh, enc_refresh), enc_access = p_enc_access, access_exp = p_access_exp
  where household_id = p_h
$$;

create or replace function public.cradle_owlet_fail(p_h uuid, p_error text, p_reconnect boolean) returns void
language sql security definer set search_path = public as $$
  update cradle_owlet set error = left(p_error, 300), needs_reconnect = needs_reconnect or p_reconnect where household_id = p_h
$$;

-- Local day and time in the family's time zone, as Cradle stores them
create or replace function public.cradle_owlet_local(t timestamptz, tz text) returns json
language sql immutable set search_path = public as $$
  select json_build_object('day', to_char(t at time zone tz, 'YYYY-MM-DD'), 'time', to_char(t at time zone tz, 'HH24:MI'))
$$;

-- One reading from the sock. Sleep starts after 3 minutes asleep and ends after 5 minutes awake,
-- off, or charging (10 if the sock's state is unknown), so brief flickers don't log a sleep. The
-- sleep's start and end are when the change was first seen. When the family tracks sleep, it
-- writes the sleep to the log like any entry (or takes over a sleep someone already started).
create or replace function public.cradle_owlet_record(p_h uuid, p_state text, p_battery int default null, p_at timestamptz default now()) returns json
language plpgsql security definer set search_path = public as $$
declare r cradle_owlet; was_asleep boolean; now_asleep boolean; hold interval; t timestamptz; act text; L json; it record;
        tracks boolean; fid text; s timestamptz; mins int;
begin
  select * into r from cradle_owlet where household_id = p_h for update;
  if not found then return json_build_object('action', 'gone'); end if;
  update cradle_owlet set ok_at = p_at, error = null, battery = coalesce(p_battery, battery) where household_id = p_h;
  if p_state = 'unsupported' then
    update cradle_owlet set state = 'unsupported', state_since = coalesce(state_since, p_at), pend_state = null where household_id = p_h;
    return json_build_object('action', null, 'state', 'unsupported');
  end if;
  was_asleep := r.state = 'asleep'; now_asleep := p_state = 'asleep';
  if r.state in ('unknown', 'unsupported') and p_state <> 'unknown' then
    -- first reading after connecting: take it as it is; a sleep in progress starts now
    act := case when now_asleep then 'start' end; t := p_at;
    update cradle_owlet set state = p_state, state_since = p_at, pend_state = null, pend_since = null where household_id = p_h;
  elsif was_asleep = now_asleep then
    update cradle_owlet set state = case when p_state = 'unknown' then state else p_state end, pend_state = null, pend_since = null where household_id = p_h;
  else
    hold := case when now_asleep then interval '3 minutes' when p_state = 'unknown' then interval '10 minutes' else interval '5 minutes' end;
    if r.pend_state is not null and (r.pend_state = 'asleep') = now_asleep then
      if p_at - r.pend_since >= hold then
        act := case when now_asleep then 'start' else 'end' end; t := r.pend_since;
        update cradle_owlet set state = case when p_state = 'unknown' then 'off' else p_state end, state_since = r.pend_since, pend_state = null, pend_since = null where household_id = p_h;
      end if;
    else
      update cradle_owlet set pend_state = p_state, pend_since = p_at where household_id = p_h;
    end if;
  end if;
  if act is null then return json_build_object('action', null, 'state', p_state); end if;

  select coalesce((data->'track'->>'sleep')::boolean, false) into tracks from cradle_items
  where household_id = p_h and id = 'settings' and not deleted;
  if not coalesce(tracks, false) then return json_build_object('action', act, 'logged', false); end if;

  if act = 'start' then
    -- someone already tapped Asleep: keep theirs
    select id into fid from cradle_items
    where household_id = p_h and kind = 'feed' and not deleted and data->>'sleep' = 'true' and coalesce(data->>'end', '') = ''
      and data->>'day' >= to_char((p_at at time zone r.tz) - interval '1 day', 'YYYY-MM-DD')
    order by data->>'day' desc, data->>'time' desc limit 1;
    if fid is null then
      fid := 'feed:owl' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      L := cradle_owlet_local(t, r.tz);
      insert into cradle_items (household_id, id, kind, data)
      values (p_h, fid, 'feed', json_build_object('day', L->>'day', 'id', substr(fid, 6), 'time', L->>'time', 'end', '',
              'sleep', true, 'mins', null, 'note', '', 'src', 'owlet')::jsonb);
    end if;
    update cradle_owlet set open_item = fid where household_id = p_h;
    return json_build_object('action', 'start', 'logged', true, 'item', fid);
  end if;

  -- end: fill in the wake time, unless someone already did (or deleted it)
  update cradle_owlet set open_item = null where household_id = p_h;
  if r.open_item is null then return json_build_object('action', 'end', 'logged', false); end if;
  select * into it from cradle_items where household_id = p_h and id = r.open_item;
  if not found or it.deleted or coalesce(it.data->>'end', '') <> '' then return json_build_object('action', 'end', 'logged', false); end if;
  s := ((it.data->>'day') || ' ' || (it.data->>'time'))::timestamp at time zone r.tz;
  if t < s then t := s; end if;   -- never end before it started (say, someone edited the start time)
  mins := greatest(1, round(extract(epoch from (t - s)) / 60));
  L := cradle_owlet_local(t, r.tz);
  update cradle_items set data = data || jsonb_build_object('end', L->>'time', 'mins', mins) where household_id = p_h and id = r.open_item;
  return json_build_object('action', 'end', 'logged', true, 'item', r.open_item, 'mins', mins);
end $$;

grant execute on function public.cradle_owlet_status(uuid), public.cradle_owlet_check(uuid), public.cradle_owlet_disconnect(uuid) to authenticated;
revoke execute on function public.cradle_owlet_status(uuid), public.cradle_owlet_check(uuid), public.cradle_owlet_disconnect(uuid) from anon, public;
revoke execute on function public.cradle_owlet_save(uuid,uuid,text,text,text,text,text,text,text,timestamptz), public.cradle_owlet_due(),
  public.cradle_owlet_tokens(uuid,text,text,timestamptz), public.cradle_owlet_fail(uuid,text,boolean),
  public.cradle_owlet_record(uuid,text,int,timestamptz), public.cradle_owlet_local(timestamptz,text) from anon, authenticated, public;
grant execute on function public.cradle_owlet_save(uuid,uuid,text,text,text,text,text,text,text,timestamptz), public.cradle_owlet_due(),
  public.cradle_owlet_tokens(uuid,text,text,timestamptz), public.cradle_owlet_fail(uuid,text,boolean),
  public.cradle_owlet_record(uuid,text,int,timestamptz) to service_role;

-- Record this run for the status page (/status/; see 5-status.sql)
create table if not exists public.cradle_schema_log (script text not null, version text not null, applied_at timestamptz not null default now());
alter table public.cradle_schema_log enable row level security;
insert into public.cradle_schema_log (script, version) values ('7-owlet.sql', '1.36');
