-- Cradle, step 5 (optional): the status page at /status/
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.
-- Then run 6-status-schedule.sql for the uptime checks (it needs your site's address).
--
-- The status page is public, so everything it can read is counts and health: no names, emails,
-- family names, or log entries. It reads them through one function, cradle_status().

-- Which database scripts ran, and when (each script adds a row when it runs)
create table if not exists public.cradle_schema_log (script text not null, version text not null, applied_at timestamptz not null default now());
alter table public.cradle_schema_log enable row level security;

-- Uptime checks: every 5 minutes the schedule asks the site for /version.json through pg_net,
-- and the next run records the answer. ms is approximate (pg_net works in the background).
create table if not exists public.cradle_status_config (id int primary key default 1 check (id = 1), site_url text);
create table if not exists public.cradle_probes (
  id      bigserial primary key,
  req_id  bigint,
  at      timestamptz not null default now(),
  done_at timestamptz,
  code    int,
  ok      boolean,
  ms      int,
  err     text
);
create index if not exists cradle_probes_at on public.cradle_probes (at);
alter table public.cradle_status_config enable row level security;
alter table public.cradle_probes enable row level security;

-- Set the address the checks ask (6-status-schedule.sql calls this)
create or replace function public.cradle_status_set_site(p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_url !~ '^https?://[^\s/]+' then raise exception 'Use your site''s full address, like https://your-cradle.netlify.app'; end if;
  -- keep just https://host (a pasted /status/ or /index.html would make every check a 404)
  insert into cradle_status_config (id, site_url) values (1, substring(trim(p_url) from '^https?://[^\s/?#]+'))
    on conflict (id) do update set site_url = excluded.site_url;
end $$;

-- One round: record answers to earlier checks, give up on any with no answer after 15 minutes,
-- start a new check, and keep 100 days.
create or replace function public.cradle_probe() returns void
language plpgsql security definer set search_path = public as $$
declare site text;
begin
  if to_regclass('net._http_response') is not null then
    execute $q$
      update public.cradle_probes p set done_at = r.created, code = r.status_code,
             ok = coalesce(r.status_code between 200 and 399 and not coalesce(r.timed_out, false), false),
             ms = greatest(0, round(extract(epoch from (r.created - p.at)) * 1000))::int,
             err = left(r.error_msg, 200)
      from net._http_response r
      where r.id = p.req_id and p.done_at is null $q$;
  end if;
  update cradle_probes set done_at = now(), ok = false, code = 0, err = 'No answer within 15 minutes'
    where done_at is null and at < now() - interval '15 minutes';
  select site_url into site from cradle_status_config where id = 1;
  if site is not null and to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is not null then
    execute 'insert into public.cradle_probes (req_id) values (net.http_get(url => $1, timeout_milliseconds => 10000))'
      using site || '/version.json?probe=' || floor(extract(epoch from now()))::bigint;
  end if;
  delete from cradle_probes where at < now() - interval '100 days';
end $$;

-- Everything the status page shows, as JSON
create or replace function public.cradle_status() returns json
language plpgsql stable security definer set search_path = public as $$
declare j jsonb; notify jsonb := null; fn jsonb := null; jobs jsonb := '[]'::jsonb;
begin
  -- the scheduled jobs and the notification job's last 24 hours (pg_cron), if it's installed
  if to_regclass('cron.job') is not null then
    execute $q$ select coalesce(jsonb_agg(jobname order by jobname), '[]'::jsonb) from cron.job where jobname like 'cradle-%' $q$ into jobs;
    if to_regclass('cron.job_run_details') is not null then
      execute $q$
        select jsonb_build_object(
          'runs', count(*), 'ok', count(*) filter (where d.status = 'succeeded'),
          'last', max(d.start_time),
          'last_error', (select jsonb_build_object('at', d2.start_time, 'msg', left(d2.return_message, 200))
                         from cron.job_run_details d2 join cron.job j2 on j2.jobid = d2.jobid
                         where j2.jobname = 'cradle-notify' and d2.status not in ('succeeded', 'running', 'starting')
                         order by d2.start_time desc limit 1))
        from cron.job_run_details d join cron.job j on j.jobid = d.jobid
        where j.jobname = 'cradle-notify' and d.start_time > now() - interval '24 hours' $q$ into notify;
    end if;
  end if;
  -- what the notification function answered (pg_net keeps about 6 hours); uptime checks left out
  if to_regclass('net._http_response') is not null then
    execute $q$
      select jsonb_build_object('calls', count(*), 'ok', count(*) filter (where r.status_code between 200 and 299),
                                'last_code', (array_agg(r.status_code order by r.created desc))[1])
      from net._http_response r
      where r.created > now() - interval '6 hours'
        and not exists (select 1 from public.cradle_probes p where p.req_id = r.id) $q$ into fn;
  end if;

  select jsonb_build_object(
    'now', now(),
    'schema', jsonb_build_object(
      'current', coalesce((select jsonb_agg(jsonb_build_object('script', script, 'version', version, 'applied_at', applied_at) order by script)
                           from (select distinct on (script) script, version, applied_at from cradle_schema_log order by script, applied_at desc) s), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(jsonb_build_object('script', script, 'version', version, 'applied_at', applied_at) order by applied_at desc)
                           from (select * from cradle_schema_log order by applied_at desc limit 12) h), '[]'::jsonb)),
    'db', jsonb_build_object(
      'bytes', pg_database_size(current_database()),
      'limit_bytes', 500 * 1024 * 1024,
      'families', (select count(*) from cradle_households),
      'accounts', (select count(*) from auth.users),
      'entries', (select count(*) from cradle_items where not deleted),
      'changes_24h', (select count(*) from cradle_items where updated_at > now() - interval '24 hours'),
      'last_change', (select max(updated_at) from cradle_items)),
    'jobs', jobs,
    'notify', notify,
    'notify_fn', fn,
    'uptime', jsonb_build_object(
      'site', (select site_url from cradle_status_config where id = 1),
      'last', (select jsonb_build_object('at', at, 'ok', ok, 'code', code, 'ms', ms, 'err', err)
               from cradle_probes where done_at is not null order by at desc limit 1),
      'pct_24h', (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2) from cradle_probes where done_at is not null and at > now() - interval '24 hours'),
      'pct_7d',  (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2) from cradle_probes where done_at is not null and at > now() - interval '7 days'),
      'pct_30d', (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2) from cradle_probes where done_at is not null and at > now() - interval '30 days'),
      'checks_30d', (select count(*) from cradle_probes where done_at is not null and at > now() - interval '30 days'),
      'ms_avg_24h', (select round(avg(ms)) from cradle_probes where ok and at > now() - interval '24 hours'),
      'ms_p95_24h', (select round(percentile_cont(0.95) within group (order by ms)) from cradle_probes where ok and at > now() - interval '24 hours'),
      'days', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'n', n, 'up', up) order by d)
                        from (select (at at time zone 'utc')::date as d, count(*) as n, count(*) filter (where ok) as up
                              from cradle_probes where done_at is not null and at > now() - interval '90 days' group by 1) x), '[]'::jsonb),
      'incidents', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'code', code, 'err', err) order by at desc)
                             from (select at, code, err from cradle_probes where done_at is not null and not ok order by at desc limit 10) i), '[]'::jsonb))
  ) into j;
  return j::json;
end $$;

-- The status page reads cradle_status() without signing in. Nothing else here is reachable from the app.
grant execute on function public.cradle_status() to anon, authenticated;
revoke execute on function public.cradle_status() from public;
revoke execute on function public.cradle_probe(), public.cradle_status_set_site(text) from anon, authenticated, public;

insert into public.cradle_schema_log (script, version) values ('5-status.sql', '1.28');
