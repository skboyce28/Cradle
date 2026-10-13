-- Cradle, step 6 (optional): uptime checks for the status page, every 5 minutes
-- Run after 5-status.sql. Paste into Supabase > SQL Editor > New query, then press Run.
--
-- Before running: replace the address below with your Cradle site's address (the one people
-- open, like https://your-cradle.netlify.app). Don't commit your edited copy. Safe to rerun.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select public.cradle_status_set_site('https://YOUR-SITE.netlify.app');

select cron.unschedule('cradle-status-probe') where exists (select 1 from cron.job where jobname = 'cradle-status-probe');
select cron.schedule('cradle-status-probe', '*/5 * * * *', $$ select public.cradle_probe() $$);

insert into public.cradle_schema_log (script, version) values ('6-status-schedule.sql', '1.28');

-- Check it's working (after 10 minutes): the newest checks, with their answers
--   select at, ok, code, ms, err from public.cradle_probes order by at desc limit 5;
--
-- Turn it off:
--   select cron.unschedule('cradle-status-probe');
