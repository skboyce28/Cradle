-- Cradle, step 8 (optional): check the Owlet sock every minute
-- Do this after 7-owlet.sql and after deploying the cradle-owlet Edge Function. See docs/owlet.md.
--
-- Before running: replace YOUR-PROJECT-REF below with your project's ref (the part before
-- .supabase.co in your Project URL), or paste the function's address exactly as its page in
-- Supabase shows it (the part after /functions/v1/ is case-sensitive).
-- (Don't commit your edited copy.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replaces the job if it already exists, so this is safe to run again
select cron.unschedule('cradle-owlet') where exists (select 1 from cron.job where jobname = 'cradle-owlet');

select cron.schedule(
  'cradle-owlet',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/cradle-owlet',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);

-- Check the function answered (wait two minutes). 200 with {"checked":1,"ok":1,"errors":0} means working:
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- Turn it off (the connection stays; reconnecting isn't needed to turn it back on):
--   select cron.unschedule('cradle-owlet');
