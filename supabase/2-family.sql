-- Cradle, step 2 of 2: families, accounts, and share keys (run after 1-setup.sql)
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

-- 4) Actions the app can call
create or replace function public.cradle_family_info(h uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'household', hh.id, 'name', hh.name, 'join_code', hh.join_code,
    'role', (select role from cradle_members where household_id = hh.id and user_id = auth.uid()),
    'members', coalesce((select json_agg(json_build_object('user_id', m.user_id, 'email', m.email, 'role', m.role, 'me', m.user_id = auth.uid()) order by m.joined_at) from cradle_members m where m.household_id = hh.id), '[]'::json),
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
  if p_user = auth.uid() then raise exception 'the owner cannot remove themselves'; end if;
  delete from cradle_members where household_id = h and user_id = p_user;
  return cradle_family_info(h);
end $$;

create or replace function public.cradle_rename(h uuid, p_name text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if h not in (select cradle_my_households()) then raise exception 'not in this family'; end if;
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
  update cradle_households set join_code = cradle_fmt_code(cradle_gen_code()) where id = h;
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

grant execute on function public.cradle_bootstrap(), public.cradle_family_info(uuid), public.cradle_invite(uuid,text),
  public.cradle_uninvite(uuid,text), public.cradle_join(text), public.cradle_remove_member(uuid,uuid), public.cradle_rename(uuid,text),
  public.cradle_new_code(uuid), public.cradle_leave(uuid)
  to authenticated;
revoke execute on function public.cradle_bootstrap(), public.cradle_family_info(uuid), public.cradle_invite(uuid,text),
  public.cradle_uninvite(uuid,text), public.cradle_join(text), public.cradle_remove_member(uuid,uuid), public.cradle_rename(uuid,text),
  public.cradle_new_code(uuid), public.cradle_leave(uuid)
  from anon, public;
