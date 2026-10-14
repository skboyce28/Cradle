-- Test-only stand-in for Supabase's auth schema and roles, so Cradle's real SQL can run on
-- plain Postgres. Safe to run more than once.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth; grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users(id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
-- Supabase keeps authenticator apps (two-step sign-in) here; the stand-in fills it in
create table if not exists auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, friendly_name text, factor_type text not null default 'totp', status text not null default 'unverified', secret text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- Stand-ins for pg_net and pg_cron (the status page reads them). http_get only records the request;
-- tests write the answers into net._http_response themselves.
create schema if not exists net;
create table if not exists net.test_requests(id bigserial primary key, url text, at timestamptz not null default now());
create table if not exists net._http_response(id bigint, status_code int, content text, timed_out boolean, error_msg text, created timestamptz not null default now());
create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint
  language sql as $$ insert into net.test_requests(url) values (url) returning id $$;
create schema if not exists cron;
create table if not exists cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text);
create table if not exists cron.job_run_details(runid bigserial primary key, jobid bigint, status text, return_message text, start_time timestamptz default now());
