-- Cradle, step 2: families, accounts, share keys, and Fun center high scores (run after 1-setup.sql)
-- Paste all of this into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once. Your existing log is moved into your family automatically.
-- Includes share keys for open sign-up (turn on sign-ups and turn off Confirm email in Supabase Auth settings).

-- 0) Share keys look like K7QM-4XPD (no 0/O/1/I/L to avoid mix-ups)
create or replace function public.cradle_gen_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random()*31)::int, 1), '') from generate_series(1,8)
$$;
create or replace function public.cradle_fmt_code(c text) returns text
language sql immutable as $$
  select substr(x,1,4) || '-' || substr(x,5,4) from (select upper(regexp_replace(coalesce(c,''), '[^A-Za-z0-9]', '', 'g')) x) t
$$;

-- 1) Families, members, and pending invites
create table if not exists public.cradle_households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Our family',
  join_code  text not null unique default public.cradle_fmt_code(public.cradle_gen_code()),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.cradle_members (
  household_id uuid not null references public.cradle_households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text,
  role         text not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.cradle_invites (
  household_id uuid not null references public.cradle_households(id) on delete cascade,
  email        text not null,
  invited_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  primary key (household_id, email)
);

-- Two-step sign-in (v1.25): the family owner can require it for everyone in the family
alter table public.cradle_households add column if not exists require_mfa boolean not null default false;

-- Upgrade older 6-character codes to the longer share keys
alter table public.cradle_households alter column join_code set default public.cradle_fmt_code(public.cradle_gen_code());
update public.cradle_households set join_code = public.cradle_fmt_code(public.cradle_gen_code())
  where join_code !~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$';

-- Wrong-key attempts, so nobody can guess keys by trying thousands of them
create table if not exists public.cradle_join_tries (
  user_id uuid not null,
  at      timestamptz not null default now()
);
alter table public.cradle_join_tries enable row level security;

-- 2) Log entries now belong to a family instead of a single account
alter table public.cradle_items add column if not exists household_id uuid references public.cradle_households(id) on delete cascade;

do $$
declare r record; h uuid;
begin
  for r in select distinct owner from public.cradle_items where household_id is null loop
    select m.household_id into h from public.cradle_members m where m.user_id = r.owner order by joined_at limit 1;
    if h is null then
      insert into public.cradle_households (created_by) values (r.owner) returning id into h;
      insert into public.cradle_members (household_id, user_id, email, role)
        select h, r.owner, lower(u.email), 'owner' from auth.users u where u.id = r.owner;
    end if;
    update public.cradle_items set household_id = h where owner = r.owner and household_id is null;
  end loop;
end $$;

alter table public.cradle_items alter column household_id set not null;
alter table public.cradle_items drop constraint if exists cradle_items_pkey;
alter table public.cradle_items add primary key (household_id, id);
create index if not exists cradle_items_household_updated on public.cradle_items (household_id, updated_at);

-- "owner" now records who last saved each entry. Deleting an account must never delete
-- the family's entries, so it only clears this field.
alter table public.cradle_items alter column owner drop not null;
alter table public.cradle_items drop constraint if exists cradle_items_owner_fkey;
alter table public.cradle_items add constraint cradle_items_owner_fkey
  foreign key (owner) references auth.users(id) on delete set null;

-- "owner" now records who last saved each entry
create or replace function public.cradle_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.owner := coalesce(auth.uid(), new.owner);
  return new;
end $$;

-- 3) Who can see what: members see their family's rows, nothing else
create or replace function public.cradle_my_households() returns setof uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.cradle_members where user_id = auth.uid()
$$;

alter table public.cradle_households enable row level security;
alter table public.cradle_members    enable row level security;
alter table public.cradle_invites    enable row level security;

drop policy if exists "cradle: own rows"    on public.cradle_items;
drop policy if exists "cradle: family rows" on public.cradle_items;
create policy "cradle: family rows" on public.cradle_items for all to authenticated
  using (household_id in (select public.cradle_my_households()))
  with check (household_id in (select public.cradle_my_households()));

drop policy if exists "cradle: my families" on public.cradle_households;
create policy "cradle: my families" on public.cradle_households for select to authenticated
  using (id in (select public.cradle_my_households()));
drop policy if exists "cradle: family members" on public.cradle_members;
create policy "cradle: family members" on public.cradle_members for select to authenticated
  using (household_id in (select public.cradle_my_households()));
drop policy if exists "cradle: family invites" on public.cradle_invites;
create policy "cradle: family invites" on public.cradle_invites for select to authenticated
  using (household_id in (select public.cradle_my_households()));

-- 3b) Two-step sign-in (v1.25). Supabase keeps the authenticator apps in auth.mfa_factors, and
--     a sign-in that finished the 6-digit code step carries aal2 in its token. Anyone who has
--     turned two-step sign-in on, and everyone in a family whose owner requires it, can only reach
--     the log after the code step. A stolen password alone isn't enough.
create or replace function public.cradle_mfa_on(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status::text = 'verified')
$$;
create or replace function public.cradle_mfa_ok(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or (not public.cradle_mfa_on(auth.uid())
          and not coalesce((select require_mfa from public.cradle_households where id = h), false))
$$;
create or replace function public.cradle_mfa_check(h uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not cradle_mfa_ok(h) then raise exception 'Finish two-step sign-in first.'; end if;
end $$;

-- A second, restrictive rule on the log: both this and "family rows" must pass
drop policy if exists "cradle: two-step sign-in" on public.cradle_items;
create policy "cradle: two-step sign-in" on public.cradle_items as restrictive for all to authenticated
  using (public.cradle_mfa_ok(household_id))
  with check (public.cradle_mfa_ok(household_id));

-- 4) Actions the app can call
--    mfa_ok says whether this sign-in may see the log; require_mfa is the family rule; each
--    member's mfa says whether they've set up an authenticator app. The share key stays hidden
--    until the code step is done.
create or replace function public.cradle_family_info(h uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'household', hh.id, 'name', hh.name,
    'join_code', case when cradle_mfa_ok(hh.id) then hh.join_code end,
    'require_mfa', hh.require_mfa, 'mfa_ok', cradle_mfa_ok(hh.id),
    'role', (select role from cradle_members where household_id = hh.id and user_id = auth.uid()),
    'members', coalesce((select json_agg(json_build_object('user_id', m.user_id, 'email', m.email, 'role', m.role, 'me', m.user_id = auth.uid(), 'mfa', cradle_mfa_on(m.user_id)) order by m.joined_at) from cradle_members m where m.household_id = hh.id), '[]'::json),
    'invites', coalesce((select json_agg(i.email order by i.created_at) from cradle_invites i where i.household_id = hh.id), '[]'::json)
  )
  from cradle_households hh
  where hh.id = h and h in (select cradle_my_households())
$$;

-- Called at every sign-in: accepts any invites for your email, then returns your family
create or replace function public.cradle_bootstrap() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt()->>'email','')); inv record; h uuid; claimed boolean := false;
begin
  if uid is null then raise exception 'not signed in'; end if;
  for inv in select i.household_id from cradle_invites i join auth.users u on u.id = uid
             where lower(i.email) = em and u.created_at <= i.created_at order by i.created_at loop
    insert into cradle_members (household_id, user_id, email, role) values (inv.household_id, uid, em, 'member')
      on conflict (household_id, user_id) do update set joined_at = now();
    delete from cradle_invites where household_id = inv.household_id and lower(email) = em;
    claimed := true;
  end loop;
  select household_id into h from cradle_members where user_id = uid order by joined_at desc limit 1;
  if h is null then
    insert into cradle_households (created_by) values (uid) returning id into h;
    insert into cradle_members (household_id, user_id, email, role) values (h, uid, em, 'owner');
  end if;
  return (select cradle_family_info(h)::jsonb || jsonb_build_object('claimed', claimed))::json;
end $$;

create or replace function public.cradle_invite(h uuid, p_email text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if h not in (select cradle_my_households()) then raise exception 'not in this family'; end if;
  perform cradle_mfa_check(h);
  if position('@' in coalesce(p_email,'')) = 0 then raise exception 'enter an email address'; end if;
  if not exists (select 1 from auth.users where lower(email) = lower(trim(p_email))) then
    raise exception 'No Cradle account uses that email yet. Send them your share key instead.';
  end if;
  insert into cradle_invites (household_id, email) values (h, lower(trim(p_email))) on conflict do nothing;
  return cradle_family_info(h);
end $$;

create or replace function public.cradle_uninvite(h uuid, p_email text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if h not in (select cradle_my_households()) then raise exception 'not in this family'; end if;
  perform cradle_mfa_check(h);
  delete from cradle_invites where household_id = h and lower(email) = lower(trim(p_email));
  return cradle_family_info(h);
end $$;

create or replace function public.cradle_join(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  -- wrong keys are answered (not raised) so the attempt is still recorded
  if (select count(*) from cradle_join_tries where user_id = uid and at > now() - interval '1 hour') >= 10 then
    return json_build_object('error', 'Too many wrong keys. Wait an hour and try again.');
  end if;
  select id into h from cradle_households where join_code = cradle_fmt_code(p_code);
  if h is null then
    insert into cradle_join_tries (user_id) values (uid);
    return json_build_object('error', 'That share key didn''t match a family. Check it and try again.');
  end if;
  insert into cradle_members (household_id, user_id, email, role) values (h, uid, lower(coalesce(auth.jwt()->>'email','')), 'member')
    on conflict (household_id, user_id) do update set joined_at = now();
  return cradle_family_info(h);
end $$;

create or replace function public.cradle_remove_member(h uuid, p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from cradle_members where household_id = h and user_id = auth.uid() and role = 'owner') then
    raise exception 'only the family owner can remove people';
  end if;
  perform cradle_mfa_check(h);
  if p_user = auth.uid() then raise exception 'the owner cannot remove themselves'; end if;
  delete from cradle_members where household_id = h and user_id = p_user;
  return cradle_family_info(h);
end $$;

create or replace function public.cradle_rename(h uuid, p_name text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if h not in (select cradle_my_households()) then raise exception 'not in this family'; end if;
  perform cradle_mfa_check(h);
  update cradle_households set name = left(trim(p_name), 60) where id = h and length(trim(p_name)) > 0;
  return cradle_family_info(h);
end $$;

-- Owner makes a new share key; the old one stops working right away
create or replace function public.cradle_new_code(h uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from cradle_members where household_id = h and user_id = auth.uid() and role = 'owner') then
    raise exception 'only the family owner can change the share key';
  end if;
  perform cradle_mfa_check(h);
  update cradle_households set join_code = cradle_fmt_code(cradle_gen_code()) where id = h;
  return cradle_family_info(h);
end $$;

-- Owner turns "everyone needs two-step sign-in" on or off. They must be using it themselves,
-- signed in with the code, so nobody can lock a family out with just a password.
create or replace function public.cradle_set_mfa_policy(h uuid, p_on boolean) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from cradle_members where household_id = h and user_id = auth.uid() and role = 'owner') then
    raise exception 'only the family owner can change this';
  end if;
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' or not cradle_mfa_on(auth.uid()) then
    raise exception 'Turn on two-step sign-in for yourself first.';
  end if;
  update cradle_households set require_mfa = coalesce(p_on, false) where id = h;
  return cradle_family_info(h);
end $$;

-- A member leaves a family (the owner stays; they can remove others instead)
create or replace function public.cradle_leave(h uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from cradle_members where household_id = h and user_id = auth.uid() and role = 'owner') then
    raise exception 'the owner can''t leave their own family';
  end if;
  delete from cradle_members where household_id = h and user_id = auth.uid();
  return public.cradle_bootstrap();
end $$;

-- 5a) Profile pictures (v1.22)
--    Each account picks a built-in picture or uploads a photo, which the app shrinks to a small
--    square (about 5 KB) and stores here, and chooses who can see it: only them, their family,
--    or everyone on this Cradle (which also shows it on the high-score boards). Others see the
--    default letter. No direct access from the app; only through the functions below.
create table if not exists public.cradle_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  kind       text not null default 'default',
  preset     text,
  photo      text,
  visibility text not null default 'family',
  updated_at timestamptz not null default now()
);
alter table public.cradle_profiles drop constraint if exists cradle_profiles_check;
alter table public.cradle_profiles add constraint cradle_profiles_check check (
  kind in ('default', 'preset', 'photo')
  and visibility in ('me', 'family', 'everyone')
  and (preset is null or preset in ('dad', 'mom', 'person', 'bear', 'bunny', 'fox', 'owl'))
  and (kind <> 'preset' or preset is not null)
  and (kind <> 'photo' or photo is not null)
  and (photo is null or (length(photo) <= 16000 and photo ~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/]+=*$')));
alter table public.cradle_profiles enable row level security;

-- Someone's picture, if the caller may see it (null means show the default letter)
create or replace function public.cradle_pic(p_user uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('kind', p.kind, 'preset', p.preset, 'photo', case when p.kind = 'photo' then p.photo end,
                           'v', floor(extract(epoch from p.updated_at))::bigint)
  from cradle_profiles p
  where p.user_id = p_user and p.kind <> 'default'
    and (p.user_id = auth.uid() or p.visibility = 'everyone'
         or (p.visibility = 'family' and exists (
               select 1 from cradle_members a join cradle_members b on b.household_id = a.household_id
               where a.user_id = auth.uid() and b.user_id = p.user_id)))
$$;

-- Your own picture and setting
create or replace function public.cradle_my_profile() returns json
language sql stable security definer set search_path = public as $$
  select coalesce((select json_build_object('kind', kind, 'preset', preset, 'photo', photo, 'visibility', visibility,
                                            'v', floor(extract(epoch from updated_at))::bigint)
                   from cradle_profiles where user_id = auth.uid()),
                  json_build_object('kind', 'default', 'visibility', 'family'))
$$;

-- Save your picture. Choosing a built-in picture or the default removes any stored photo.
create or replace function public.cradle_set_profile(p_kind text, p_preset text default null, p_photo text default null, p_visibility text default 'family')
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); old text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('default', 'preset', 'photo') then raise exception 'Pick a picture.'; end if;
  if p_visibility not in ('me', 'family', 'everyone') then raise exception 'Choose who can see it.'; end if;
  if p_kind = 'preset' and (p_preset is null or p_preset not in ('dad', 'mom', 'person', 'bear', 'bunny', 'fox', 'owl')) then raise exception 'Pick a picture.'; end if;
  if p_kind = 'photo' and p_photo is null then
    select photo into old from cradle_profiles where user_id = uid;   -- keep the photo already saved
    if old is null then raise exception 'Upload a photo first.'; end if;
  end if;
  if p_photo is not null and (length(p_photo) > 16000 or p_photo !~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/]+=*$') then
    raise exception 'That photo is too large or isn''t an image.';
  end if;
  insert into cradle_profiles (user_id, kind, preset, photo, visibility, updated_at)
  values (uid, p_kind, case when p_kind = 'preset' then p_preset end, case when p_kind = 'photo' then coalesce(p_photo, old) end, p_visibility, now())
  on conflict (user_id) do update set kind = excluded.kind, preset = excluded.preset, photo = excluded.photo,
    visibility = excluded.visibility, updated_at = now();
  return cradle_my_profile();
end $$;

-- Pictures for everyone in one of your families, keyed by account id (only those you may see)
create or replace function public.cradle_family_pics(h uuid) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(m.user_id, cradle_pic(m.user_id)) filter (where cradle_pic(m.user_id) is not null), '{}'::json)
  from cradle_members m
  where m.household_id = h and exists (select 1 from cradle_members me where me.household_id = h and me.user_id = auth.uid())
$$;

-- 5) Fun center: high scores (Bottle Catch, Daily Word, and Stork Flight)
--    Only initials and scores are ever shown to other people. All reads and writes go
--    through the functions below; the tables themselves aren't readable from the app.
create table if not exists public.cradle_players (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  initials   text not null check (initials ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.cradle_scores (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.cradle_households(id) on delete set null,
  game         text not null default 'bottles',
  initials     text not null check (initials ~ '^[A-Z]{3}$'),
  score        int  not null check (score between 0 and 20000),
  seconds      int  not null check (seconds between 0 and 130),
  created_at   timestamptz not null default now()
);
create index if not exists cradle_scores_game_score on public.cradle_scores (game, score desc);
create index if not exists cradle_scores_user on public.cradle_scores (user_id, created_at desc);
-- Daily Word (v1.18): one result per person per day. detail is the colored grid only, never the
-- letters: "5h:01200/22222" means 5 letters, hard mode, two guesses (0 gray, 1 yellow, 2 green).
alter table public.cradle_scores add column if not exists day date;
alter table public.cradle_scores add column if not exists detail text;
alter table public.cradle_scores drop constraint if exists cradle_scores_detail;
alter table public.cradle_scores add constraint cradle_scores_detail check (detail is null or length(detail) <= 60);
create unique index if not exists cradle_scores_one_a_day on public.cradle_scores (user_id, game, day) where day is not null;
-- Stork Flight (v1.19): a flight can last longer than a Bottle Catch round, up to an hour
alter table public.cradle_scores drop constraint if exists cradle_scores_seconds_check;
alter table public.cradle_scores add constraint cradle_scores_seconds_check check (seconds between 0 and 3600);

alter table public.cradle_players enable row level security;
alter table public.cradle_scores  enable row level security;

-- Initials: three letters, and a short list that isn't allowed on a shared board
create or replace function public.cradle_clean_initials(p text) returns text
language plpgsql immutable as $$
declare i text := upper(regexp_replace(coalesce(p,''), '[^A-Za-z]', '', 'g'));
begin
  if length(i) <> 3 then raise exception 'Initials need exactly 3 letters.'; end if;
  if i = any (array['ASS','FUK','FUC','FCK','FKU','SEX','CUM','TIT','DIK','DIC','COK','KKK','NIG','NGR','FAG','WTF','STD','VAG','POO','PEE','SUX','SUK','JIZ','GOD','NAZ','HIV','DIE','KYS','PIS','XXX']) then
    raise exception 'Please pick different initials.';
  end if;
  return i;
end $$;

-- The leaderboards: Everyone (each person's best), Our family, and My best
create or replace function public.cradle_scores_board(p_game text default 'bottles') returns json
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  fam as (select household_id from cradle_members where user_id = (select uid from me) order by joined_at desc limit 1),
  best as (
    select distinct on (s.user_id) s.user_id, s.initials, s.score, s.created_at, s.household_id
    from cradle_scores s where s.game = p_game
    order by s.user_id, s.score desc, s.created_at asc),
  famscores as (
    select distinct on (s.user_id) s.user_id, s.initials, s.score, s.created_at
    from cradle_scores s join cradle_members m on m.user_id = s.user_id and m.household_id = (select household_id from fam)
    where s.game = p_game
    order by s.user_id, s.score desc, s.created_at asc)
  select json_build_object(
    'initials', (select initials from cradle_players where user_id = (select uid from me)),
    'everyone', coalesce((select json_agg(json_build_object('initials', b.initials, 'score', b.score, 'me', b.user_id = (select uid from me), 'at', b.created_at, 'pic', cradle_pic(b.user_id)) order by b.score desc, b.created_at)
                          from (select * from best order by score desc, created_at limit 10) b), '[]'::json),
    'family',   coalesce((select json_agg(json_build_object('initials', f.initials, 'score', f.score, 'me', f.user_id = (select uid from me), 'at', f.created_at, 'pic', cradle_pic(f.user_id)) order by f.score desc, f.created_at)
                          from (select * from famscores order by score desc, created_at limit 10) f), '[]'::json),
    'mine',     coalesce((select json_agg(json_build_object('score', x.score, 'at', x.created_at) order by x.score desc, x.created_at)
                          from (select score, created_at from cradle_scores where user_id = (select uid from me) and game = p_game order by score desc, created_at limit 10) x), '[]'::json),
    'rank',     (select count(*) + 1 from best b2 where b2.score > coalesce((select max(score) from cradle_scores where user_id = (select uid from me) and game = p_game), -1)),
    'players',  (select count(*) from best)
  );
$$;

-- Save or change your initials (also updates your past scores, so the boards stay consistent)
create or replace function public.cradle_set_initials(p_initials text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  i := cradle_clean_initials(p_initials);
  insert into cradle_players (user_id, initials) values (uid, i)
    on conflict (user_id) do update set initials = excluded.initials, updated_at = now();
  update cradle_scores set initials = i where user_id = uid;
  return cradle_scores_board('bottles');
end $$;

-- Post a score. The server refuses scores a round couldn't produce and posting too often.
--   bottles (Bottle Catch): rounds up to 130 seconds, at most 100 points a second
--   stork (Stork Flight): flights up to an hour, at most 40 points a second
create or replace function public.cradle_submit_score(p_score int, p_seconds int, p_initials text default null, p_game text default 'bottles') returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i text; h uuid; last timestamptz; maxsecs int; rate int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_game is null or p_game not in ('bottles', 'stork') then raise exception 'unknown game'; end if;
  maxsecs := case when p_game = 'bottles' then 130 else 3600 end;
  rate := case when p_game = 'bottles' then 100 else 40 end;
  if p_seconds is null or p_seconds < 0 or p_seconds > maxsecs then raise exception 'That round length isn''t possible.'; end if;
  if p_score is null or p_score < 0 or p_score > rate * greatest(p_seconds, 1) then raise exception 'That score isn''t possible for a round that long.'; end if;
  select max(created_at) into last from cradle_scores where user_id = uid and game = p_game;
  if last is not null and last > now() - interval '10 seconds' then raise exception 'Scores are coming in too fast. Try again in a moment.'; end if;
  if (select count(*) from cradle_scores where user_id = uid and created_at > now() - interval '1 day') >= 200 then
    raise exception 'That''s a lot of rounds today. Scores will post again tomorrow.';
  end if;
  if p_initials is not null and p_initials <> '' then
    i := cradle_clean_initials(p_initials);
    insert into cradle_players (user_id, initials) values (uid, i)
      on conflict (user_id) do update set initials = excluded.initials, updated_at = now();
  else
    select initials into i from cradle_players where user_id = uid;
    if i is null then raise exception 'Pick your initials first.'; end if;
  end if;
  select household_id into h from cradle_members where user_id = uid order by joined_at desc limit 1;
  insert into cradle_scores (user_id, household_id, game, initials, score, seconds) values (uid, h, p_game, i, p_score, p_seconds);
  return cradle_scores_board(p_game);
end $$;

-- Daily Word boards: total points (a win in 1 guess is 70, in 6 is 20, +10 in hard mode),
-- current streak of days won, and each family member's grid for p_day (colors only).
create or replace function public.cradle_word_board(p_day date default null) returns json
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  d as (select coalesce(p_day, (now() at time zone 'utc')::date) as day),
  fam as (select household_id from cradle_members where user_id = (select uid from me) order by joined_at desc limit 1),
  w as (select user_id, initials, score, day, detail, created_at from cradle_scores where game = 'word' and day is not null),
  wins as (select user_id, day, day - (row_number() over (partition by user_id order by day))::int as grp from w where score > 0),
  runs as (select user_id, max(day) as last_day, count(*)::int as n from wins group by user_id, grp),
  streak as (select user_id, coalesce(max(n) filter (where last_day >= (select day from d) - 1), 0) as cur, max(n) as best from runs group by user_id),
  tot as (
    select w.user_id, (array_agg(w.initials order by w.created_at desc))[1] as initials, sum(w.score)::int as total,
           count(*)::int as played, (count(*) filter (where w.score > 0))::int as won, max(w.created_at) as at,
           max(w.detail) filter (where w.day = (select day from d)) as today
    from w group by w.user_id),
  b as (select t.*, coalesce(s.cur, 0) as streak, coalesce(s.best, 0) as best_streak, t.user_id = (select uid from me) as me from tot t left join streak s on s.user_id = t.user_id),
  f as (select b.* from b join cradle_members m on m.user_id = b.user_id and m.household_id = (select household_id from fam))
  select json_build_object(
    'initials', (select initials from cradle_players where user_id = (select uid from me)),
    'day',      (select day from d),
    'everyone', coalesce((select json_agg(json_build_object('initials', x.initials, 'score', x.total, 'played', x.played, 'won', x.won, 'streak', x.streak, 'me', x.me, 'at', x.at, 'pic', cradle_pic(x.user_id)) order by x.total desc, x.at)
                          from (select * from b order by total desc, at limit 10) x), '[]'::json),
    'family',   coalesce((select json_agg(json_build_object('initials', x.initials, 'score', x.total, 'played', x.played, 'won', x.won, 'streak', x.streak, 'me', x.me, 'at', x.at, 'today', x.today, 'pic', cradle_pic(x.user_id)) order by x.total desc, x.at)
                          from (select * from f order by total desc, at limit 20) x), '[]'::json),
    'mine',     coalesce((select json_agg(json_build_object('day', x.day, 'score', x.score, 'detail', x.detail) order by x.day desc)
                          from (select day, score, detail from w where user_id = (select uid from me) order by day desc limit 10) x), '[]'::json),
    'me',       (select json_build_object('score', total, 'played', played, 'won', won, 'streak', streak, 'best_streak', best_streak, 'today', today) from b where me),
    'rank',     (select count(*) + 1 from b where total > coalesce((select total from b where me), -1)),
    'players',  (select count(*) from b)
  );
$$;

-- Post a Daily Word result: the day (the player's own date), the length, the grid as digits
-- ("01200/22222"), and hard mode. Points are worked out here, and each day counts once.
create or replace function public.cradle_submit_word(p_day date, p_len int, p_rows text, p_hard boolean default false, p_initials text default null) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i text; h uuid; r text[]; n int; won boolean; pts int; today date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_len is null or p_len not in (4, 5, 6) then raise exception 'Words are 4, 5, or 6 letters.'; end if;
  if p_day is null or p_day < today - 1 or p_day > today + 1 then raise exception 'That isn''t today''s word.'; end if;
  r := string_to_array(coalesce(p_rows, ''), '/');
  n := coalesce(array_length(r, 1), 0);
  if n < 1 or n > 6 then raise exception 'That result isn''t possible.'; end if;
  for k in 1..n loop
    if r[k] !~ ('^[012]{' || p_len || '}$') or (k < n and r[k] = repeat('2', p_len)) then raise exception 'That result isn''t possible.'; end if;
  end loop;
  won := r[n] = repeat('2', p_len);
  if not won and n < 6 then raise exception 'That result isn''t possible.'; end if;
  pts := case when won then (8 - n) * 10 + case when p_hard then 10 else 0 end else 0 end;
  if p_initials is not null and p_initials <> '' then
    i := cradle_clean_initials(p_initials);
    insert into cradle_players (user_id, initials) values (uid, i)
      on conflict (user_id) do update set initials = excluded.initials, updated_at = now();
  else
    select initials into i from cradle_players where user_id = uid;
    if i is null then raise exception 'Pick your initials first.'; end if;
  end if;
  select household_id into h from cradle_members where user_id = uid order by joined_at desc limit 1;
  insert into cradle_scores (user_id, household_id, game, initials, score, seconds, day, detail)
  values (uid, h, 'word', i, pts, 0, p_day, p_len || case when p_hard then 'h' else '' end || ':' || p_rows)
  on conflict (user_id, game, day) where day is not null do nothing;
  if not found then raise exception 'You already played this day''s word.'; end if;
  return cradle_word_board(p_day);
end $$;

grant execute on function public.cradle_bootstrap(), public.cradle_family_info(uuid), public.cradle_invite(uuid,text),
  public.cradle_uninvite(uuid,text), public.cradle_join(text), public.cradle_remove_member(uuid,uuid), public.cradle_rename(uuid,text),
  public.cradle_new_code(uuid), public.cradle_leave(uuid), public.cradle_set_mfa_policy(uuid,boolean),
  public.cradle_scores_board(text), public.cradle_set_initials(text), public.cradle_submit_score(int,int,text,text),
  public.cradle_word_board(date), public.cradle_submit_word(date,int,text,boolean,text),
  public.cradle_my_profile(), public.cradle_set_profile(text,text,text,text), public.cradle_family_pics(uuid)
  to authenticated;
revoke execute on function public.cradle_bootstrap(), public.cradle_family_info(uuid), public.cradle_invite(uuid,text),
  public.cradle_uninvite(uuid,text), public.cradle_join(text), public.cradle_remove_member(uuid,uuid), public.cradle_rename(uuid,text),
  public.cradle_new_code(uuid), public.cradle_leave(uuid), public.cradle_set_mfa_policy(uuid,boolean),
  public.cradle_scores_board(text), public.cradle_set_initials(text), public.cradle_submit_score(int,int,text,text),
  public.cradle_word_board(date), public.cradle_submit_word(date,int,text,boolean,text),
  public.cradle_my_profile(), public.cradle_set_profile(text,text,text,text), public.cradle_family_pics(uuid)
  from anon, public;
-- cradle_pic is only used inside the functions above
revoke execute on function public.cradle_pic(uuid) from anon, authenticated, public;
-- the two-step helpers are used by the rules and functions above; cradle_mfa_ok must stay
-- callable by signed-in accounts because the log's row rule calls it
revoke execute on function public.cradle_mfa_on(uuid), public.cradle_mfa_check(uuid) from anon, authenticated, public;
revoke execute on function public.cradle_mfa_ok(uuid) from anon, public;
grant execute on function public.cradle_mfa_ok(uuid) to authenticated;

-- 5b) Support: feedback from the app (v1.31)
--    Anyone signed in can send a bug, an idea, or a question, with an optional screenshot. Accounts
--    listed in cradle_admins (added by the Cradle operator in the SQL Editor) see every submission
--    in the app's Feedback inbox, set its status, and reply; people see the status and reply on
--    their own submissions. Reviewed submissions earn the Quality Assurance and Compliance Officer
--    achievements. No direct access to these tables from the app; only the functions below.
create table if not exists public.cradle_admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
create table if not exists public.cradle_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  household_id uuid references public.cradle_households(id) on delete set null,
  kind         text not null,
  body         text not null,
  screenshot   text,
  app_version  text,
  device       text,
  status       text not null default 'new',
  reply        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users(id) on delete set null
);
alter table public.cradle_feedback drop constraint if exists cradle_feedback_check;
alter table public.cradle_feedback add constraint cradle_feedback_check check (
  kind in ('bug', 'idea', 'question')
  and status in ('new', 'reviewed', 'planned', 'used', 'wontdo')
  and length(body) between 3 and 4000
  and (reply is null or length(reply) <= 2000)
  and (screenshot is null or (length(screenshot) <= 400000 and screenshot ~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/]+=*$')));
create index if not exists cradle_feedback_user on public.cradle_feedback (user_id, created_at);
create index if not exists cradle_feedback_status on public.cradle_feedback (status, created_at);
alter table public.cradle_admins enable row level security;
alter table public.cradle_feedback enable row level security;

create or replace function public.cradle_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cradle_admins where user_id = auth.uid())
$$;
-- Admins who use two-step sign-in must have finished the code step
create or replace function public.cradle_admin_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not cradle_is_admin() then raise exception 'Only Cradle admins can do this.'; end if;
  if cradle_mfa_on(auth.uid()) and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Finish two-step sign-in first.';
  end if;
end $$;

-- Your own submissions, newest first, with status and reply, and whether you're an admin
create or replace function public.cradle_my_feedback() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'admin', cradle_is_admin(),
    'new_count', case when cradle_is_admin() then (select count(*) from cradle_feedback where status = 'new') end,
    'items', coalesce((select json_agg(json_build_object('id', f.id, 'kind', f.kind, 'body', f.body, 'status', f.status, 'reply', f.reply,
                         'shot', f.screenshot is not null, 'at', f.created_at, 'reviewed_at', f.reviewed_at) order by f.created_at desc)
                       from (select * from cradle_feedback where user_id = auth.uid() order by created_at desc limit 50) f), '[]'::json))
$$;

-- Send feedback (10 a day at most)
create or replace function public.cradle_submit_feedback(p_kind text, p_body text, p_screenshot text default null,
                                                         p_version text default null, p_device text default null) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('bug', 'idea', 'question') then raise exception 'Pick bug, idea, or question.'; end if;
  if length(trim(coalesce(p_body, ''))) < 3 then raise exception 'Tell us a little more.'; end if;
  if length(p_body) > 4000 then raise exception 'That''s too long. Keep it under 4,000 characters.'; end if;
  if p_screenshot is not null and (length(p_screenshot) > 400000 or p_screenshot !~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/]+=*$') then
    raise exception 'That screenshot is too large or isn''t an image.';
  end if;
  if (select count(*) from cradle_feedback where user_id = uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s 10 today. Thanks! Please send more tomorrow.';
  end if;
  select household_id into h from cradle_members where user_id = uid order by joined_at desc limit 1;
  insert into cradle_feedback (user_id, household_id, kind, body, screenshot, app_version, device)
  values (uid, h, p_kind, trim(p_body), p_screenshot, left(p_version, 20), left(p_device, 200));
  return cradle_my_feedback();
end $$;

-- Admins: every submission (screenshots are fetched one at a time), with counts by status
create or replace function public.cradle_feedback_inbox(p_status text default null) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform cradle_admin_check();
  return json_build_object(
    'counts', coalesce((select json_object_agg(status, n) from (select status, count(*) n from cradle_feedback group by status) c), '{}'::json),
    'items', coalesce((select json_agg(json_build_object('id', f.id, 'kind', f.kind, 'body', f.body, 'status', f.status, 'reply', f.reply,
                          'shot', f.screenshot is not null, 'version', f.app_version, 'device', f.device, 'at', f.created_at,
                          'reviewed_at', f.reviewed_at, 'email', u.email, 'family', h.name,
                          'from_reviewed', (select count(*) from cradle_feedback x where x.user_id = f.user_id and x.status <> 'new'))
                        order by (f.status = 'new') desc, f.created_at desc)
                        from (select * from cradle_feedback where p_status is null or status = p_status order by created_at desc limit 200) f
                        left join auth.users u on u.id = f.user_id
                        left join cradle_households h on h.id = f.household_id), '[]'::json));
end $$;
create or replace function public.cradle_feedback_shot(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare s text;
begin
  select screenshot into s from cradle_feedback where id = p_id and (user_id = auth.uid() or cradle_is_admin());
  if s is not null and cradle_is_admin() then perform cradle_admin_check(); end if;
  return s;
end $$;

-- Admins: set the status (reviewed, planned, used, won't do, or back to new) and reply
create or replace function public.cradle_feedback_review(p_id uuid, p_status text, p_reply text default null) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform cradle_admin_check();
  if p_status not in ('new', 'reviewed', 'planned', 'used', 'wontdo') then raise exception 'Pick a status.'; end if;
  update cradle_feedback set status = p_status, reply = nullif(left(trim(coalesce(p_reply, '')), 2000), ''), updated_at = now(),
         reviewed_at = case when p_status = 'new' then null else coalesce(reviewed_at, now()) end,
         reviewed_by = case when p_status = 'new' then null else auth.uid() end
  where id = p_id;
  if not found then raise exception 'That feedback wasn''t found.'; end if;
  return cradle_feedback_inbox(null);
end $$;

grant execute on function public.cradle_my_feedback(), public.cradle_submit_feedback(text,text,text,text,text), public.cradle_feedback_inbox(text),
  public.cradle_feedback_shot(uuid), public.cradle_feedback_review(uuid,text,text) to authenticated;
revoke execute on function public.cradle_my_feedback(), public.cradle_submit_feedback(text,text,text,text,text), public.cradle_feedback_inbox(text),
  public.cradle_feedback_shot(uuid), public.cradle_feedback_review(uuid,text,text) from anon, public;
revoke execute on function public.cradle_is_admin(), public.cradle_admin_check() from anon, authenticated, public;

-- Record this run for the status page (/status/; see 5-status.sql)
create table if not exists public.cradle_schema_log (script text not null, version text not null, applied_at timestamptz not null default now());
alter table public.cradle_schema_log enable row level security;
insert into public.cradle_schema_log (script, version) values ('2-family.sql', '1.31');
