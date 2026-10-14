-- Cradle, step 9 (recommended when others use your Cradle): Terms and Privacy acceptance
-- Run after 1-setup.sql and 2-family.sql. Safe to rerun. See docs/terms.md and docs/accounts-and-families.md.
--
-- What it does:
--   - Keeps each version of the terms (its version name and the SHA-256 of its exact text).
--   - Records each person's acceptance: which version, the text's fingerprint, the server time, and
--     the Cradle version that showed it. Rows are only ever added.
--   - Until someone accepts the current version, the log doesn't sync for them: a restrictive rule on
--     cradle_items (like two-step sign-in's) hides and refuses their family's rows. The app shows the
--     terms instead.
--
-- Changing the terms: edit docs/terms.md and the copy in cradle.html (id="termsText"), give it a new
-- version, then put the new version and its SHA-256 in the insert at the bottom and run this again.
-- Everyone is asked to accept the new version. Fixing a typo under the same version updates the
-- fingerprint without asking again.

create table if not exists public.cradle_terms (
  version       text primary key,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  required_from timestamptz not null default now()
);
create table if not exists public.cradle_terms_acceptances (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  version     text not null references public.cradle_terms(version),
  sha256      text not null,
  accepted_at timestamptz not null default now(),
  app_version text
);
create index if not exists cradle_terms_acceptances_user on public.cradle_terms_acceptances (user_id, version);
revoke all on public.cradle_terms, public.cradle_terms_acceptances from anon, authenticated;
alter table public.cradle_terms enable row level security;
alter table public.cradle_terms_acceptances enable row level security;

-- The version everyone must have accepted now (null if none is set up)
create or replace function public.cradle_terms_current_version() returns text
language sql stable security definer set search_path = public as $$
  select version from cradle_terms where required_from <= now() order by required_from desc limit 1
$$;

-- Has the person signed in accepted it? (true when no terms are set up)
create or replace function public.cradle_terms_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select cradle_terms_current_version() is null
      or exists (select 1 from cradle_terms_acceptances a
                 where a.user_id = auth.uid() and a.version = cradle_terms_current_version())
$$;

-- The log only syncs for people who accepted the current terms. Restrictive: this and the family
-- rule must both pass. (select ...) runs the check once per query, not once per row.
drop policy if exists "cradle: terms accepted" on public.cradle_items;
create policy "cradle: terms accepted" on public.cradle_items as restrictive for all to authenticated
  using ((select public.cradle_terms_ok()))
  with check ((select public.cradle_terms_ok()));

-- What the app needs: the current version and fingerprint, and this person's acceptances
create or replace function public.cradle_terms_status() returns json
language plpgsql stable security definer set search_path = public as $$
declare v text := cradle_terms_current_version();
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return json_build_object(
    'required', (select json_build_object('version', t.version, 'sha256', t.sha256, 'required_from', t.required_from) from cradle_terms t where t.version = v),
    'accepted', cradle_terms_ok(),
    'accepted_at', (select max(accepted_at) from cradle_terms_acceptances where user_id = auth.uid() and version = v),
    'history', coalesce((select json_agg(json_build_object('version', version, 'accepted_at', accepted_at) order by accepted_at desc)
                         from cradle_terms_acceptances where user_id = auth.uid()), '[]'::json));
end $$;

-- Accept: only the current version, and only the exact text it's stored with
create or replace function public.cradle_terms_accept(p_version text, p_sha256 text, p_app_version text default null) returns json
language plpgsql security definer set search_path = public as $$
declare cur cradle_terms;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into cur from cradle_terms where version = cradle_terms_current_version();
  if not found then return cradle_terms_status(); end if;
  if p_version is distinct from cur.version or lower(p_sha256) is distinct from cur.sha256 then
    raise exception 'These terms are out of date. Reload Cradle to get the current version (%).', cur.version;
  end if;
  if not exists (select 1 from cradle_terms_acceptances where user_id = auth.uid() and version = cur.version) then
    insert into cradle_terms_acceptances (user_id, version, sha256, app_version) values (auth.uid(), cur.version, cur.sha256, left(p_app_version, 20));
  end if;
  return cradle_terms_status();
end $$;

grant execute on function public.cradle_terms_status(), public.cradle_terms_accept(text, text, text) to authenticated;
revoke execute on function public.cradle_terms_status(), public.cradle_terms_accept(text, text, text) from anon, public;
revoke execute on function public.cradle_terms_current_version() from anon, public;
grant execute on function public.cradle_terms_current_version(), public.cradle_terms_ok() to authenticated;
revoke execute on function public.cradle_terms_ok() from anon, public;

-- The current terms (docs/terms.md). Keep this in step with that file and cradle.html.
insert into public.cradle_terms (version, sha256)
values ('2026-10-15', '072f0fa5a177d923b93dae2f0c4868d713e4774526a68e1c9de832ebd4f917e1')
on conflict (version) do update set sha256 = excluded.sha256;

-- Record this run for the status page (/status/; see 5-status.sql)
create table if not exists public.cradle_schema_log (script text not null, version text not null, applied_at timestamptz not null default now());
alter table public.cradle_schema_log enable row level security;
insert into public.cradle_schema_log (script, version) values ('9-terms.sql', '1.37');
