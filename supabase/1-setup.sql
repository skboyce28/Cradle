-- Cradle, step 1: the log table (then 2-family.sql; 3 and 4 are optional, for notifications)
-- Paste all of this into Supabase > SQL Editor > New query, then press Run.
-- Then run 2-family.sql. Both are safe to run more than once.

-- One table holds every shared piece of the log (feeds, day notes, weights, settings).
create table if not exists public.cradle_items (
  owner      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null,
  kind       text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

create index if not exists cradle_items_owner_updated on public.cradle_items (owner, updated_at);

-- Only the signed-in account can see or change its own rows.
-- (Once 2-family.sql has run, families take over and this step leaves its rules alone.)
alter table public.cradle_items enable row level security;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'cradle_items' and column_name = 'household_id') then
    drop policy if exists "cradle: own rows" on public.cradle_items;
    create policy "cradle: own rows" on public.cradle_items
      for all to authenticated
      using (auth.uid() = owner)
      with check (auth.uid() = owner);

    -- Stamp every insert and update with the server's time, so phones can ask "what changed since...".
    create or replace function public.cradle_touch() returns trigger
    language plpgsql as $f$
    begin
      new.updated_at := now();
      return new;
    end $f$;
  end if;
end $$;

drop trigger if exists cradle_touch on public.cradle_items;
create trigger cradle_touch before insert or update on public.cradle_items
  for each row execute function public.cradle_touch();

-- Record this run for the status page (/status/; see 5-status.sql)
create table if not exists public.cradle_schema_log (script text not null, version text not null, applied_at timestamptz not null default now());
alter table public.cradle_schema_log enable row level security;
insert into public.cradle_schema_log (script, version) values ('1-setup.sql', '1.5');
