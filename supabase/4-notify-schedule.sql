-- Cradle, step 4 (optional): run the cradle-notify function every minute
-- Do this after 3-notifications.sql and after deploying the cradle-notify Edge Function.
-- See docs/notifications.md.
--
-- Before running: replace the address below with your function's web address, shown on the
-- function's page in Supabase. Usually that means replacing YOUR-PROJECT-REF with your
-- project's ref (the part before .supabase.co in your Project URL). The part after
-- /functions/v1/ is case-sensitive: if the address shows Cradle-notify, use Cradle-notify.
-- Renaming the function in the dashboard doesn't change its address.
-- (Don't commit your edited copy.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replaces the job if it already exists, so this is safe to run again
select cron.unschedule('cradle-notify') where exists (select 1 from cron.job where jobname = 'cradle-notify');

select cron.schedule(
  'cradle-notify',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/cradle-notify',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);

-- Check the function answered (wait two minutes after running this). 200 means working;
-- 404 "Requested function was not found" means the address above doesn't match the function's:
--   select status_code, content, created from net._http_response order by created desc limit 5;
--
-- Check it's running (a row per run, newest first):
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'cradle-notify')
--   order by start_time desc limit 5;
--
-- Turn it off:
--   select cron.unschedule('cradle-notify');
