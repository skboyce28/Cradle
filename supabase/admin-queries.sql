-- Cradle: admin queries for the person who runs the Supabase project
-- Run ONE query at a time in Supabase > SQL Editor. Replace the example values
-- ('their@email.com', 'K7QM-4XPD', ...) before running. Nothing here runs automatically.
--
-- Usernames are stored as email addresses: the username "grandma" is grandma@cradle.cfg.
-- Queries that change data are marked CHANGES DATA. Export the family's log from the
-- app first if you're unsure (profile menu > Data management > Export data).


-- ============================================================
-- Accounts
-- ============================================================

-- 1. Everyone with an account, newest first
select email, created_at, last_sign_in_at,
       email_confirmed_at is not null as confirmed
from auth.users
order by created_at desc;

-- 2. CHANGES DATA. Confirm one account stuck at "confirm your email"
--    (needed for accounts created while Confirm email was still on)
update auth.users
set email_confirmed_at = now()
where email = 'their@email.com'
  and email_confirmed_at is null;

-- 3. CHANGES DATA. Confirm every unconfirmed account at once
update auth.users
set email_confirmed_at = now()
where email_confirmed_at is null;

-- 4. Delete an account: use the dashboard instead (Authentication > Users > ... > Delete user).
--    Their family's entries are kept; only the "last saved by" field on them is cleared.
--    If they were a family's only member, export that family's log first (query 12).


-- ============================================================
-- Families
-- ============================================================

-- 5. Every family: share key, people, entries, last activity
select h.name, h.join_code as share_key,
       (select count(*) from public.cradle_members m where m.household_id = h.id) as people,
       (select count(*) from public.cradle_items i where i.household_id = h.id and not i.deleted) as entries,
       (select max(updated_at) from public.cradle_items i where i.household_id = h.id) as last_activity,
       h.created_at
from public.cradle_households h
order by last_activity desc nulls last;

-- 6. Who is in a family, by share key
select m.email, m.role, m.joined_at
from public.cradle_members m
join public.cradle_households h on h.id = m.household_id
where h.join_code = 'K7QM-4XPD'
order by m.joined_at;

-- 7. Which family (or families) an account belongs to.
--    The app opens the family with the most recent joined_at.
select h.name, h.join_code as share_key, m.role, m.joined_at
from public.cradle_members m
join public.cradle_households h on h.id = m.household_id
where m.email = 'their@email.com'
order by m.joined_at desc;

-- 8. CHANGES DATA. New share key for a family (the old one stops working right away).
--    The owner can also do this in the app: Family > New key.
update public.cradle_households
set join_code = public.cradle_fmt_code(public.cradle_gen_code())
where join_code = 'K7QM-4XPD'
returning name, join_code as new_share_key;

-- 9. CHANGES DATA. Make someone the owner of their family (for example, if the owner
--    lost access). Run both statements together.
update public.cradle_members set role = 'member'
where household_id = (select household_id from public.cradle_members where email = 'new-owner@email.com' order by joined_at desc limit 1)
  and role = 'owner';
update public.cradle_members set role = 'owner'
where email = 'new-owner@email.com'
  and household_id = (select household_id from public.cradle_members where email = 'new-owner@email.com' order by joined_at desc limit 1);

-- 10. CHANGES DATA. Remove someone from a family (the owner can also do this in the app).
--     Next time they open Cradle they get their own empty family.
delete from public.cradle_members
where email = 'their@email.com'
  and household_id = (select id from public.cradle_households where join_code = 'K7QM-4XPD');

-- 11. CHANGES DATA. Clear the "too many wrong keys" lockout for one account
delete from public.cradle_join_tries
where user_id = (select id from auth.users where email = 'their@email.com');


-- ============================================================
-- Data
-- ============================================================

-- 12. A family's whole log, newest first (copy the results somewhere safe)
select i.id, i.kind, i.data, i.updated_at, u.email as last_saved_by
from public.cradle_items i
left join auth.users u on u.id = i.owner
where i.household_id = (select id from public.cradle_households where join_code = 'K7QM-4XPD')
  and not i.deleted
order by i.updated_at desc;

-- 13. Entries per family by kind (feeds include diaper-only rows and baths)
select h.name, i.kind, count(*) as entries
from public.cradle_items i
join public.cradle_households h on h.id = i.household_id
where not i.deleted
group by h.name, i.kind
order by h.name, i.kind;

-- 14. Baths logged per family
select h.name, i.data->>'bath' as bath, count(*) as baths, max(i.data->>'day') as last_day
from public.cradle_items i
join public.cradle_households h on h.id = i.household_id
where not i.deleted and i.kind = 'feed' and i.data ? 'bath'
group by h.name, i.data->>'bath'
order by h.name;

-- 15. How much space Cradle uses (free projects include 500 MB of database)
select pg_size_pretty(pg_total_relation_size('public.cradle_items')) as log_table,
       pg_size_pretty(pg_database_size(current_database())) as whole_database;

-- 16. CHANGES DATA. Tidy up: remove deletion markers older than 90 days.
--     A phone offline for longer than that could bring a deleted entry back, so keep the window long.
delete from public.cradle_items
where deleted and updated_at < now() - interval '90 days';


-- ============================================================
-- Fun center high scores (Bottle Catch, Daily Word, and Stork Flight)
-- ============================================================

-- 17. Top 20 scores in one game, with the account behind each (only you see emails; players see initials).
--     Use 'bottles' for Bottle Catch or 'stork' for Stork Flight.
select s.id, s.initials, s.score, s.seconds, s.created_at, u.email
from public.cradle_scores s
join auth.users u on u.id = s.user_id
where s.game = 'bottles'
order by s.score desc, s.created_at
limit 20;

-- 18. CHANGES DATA. Remove one score (use the id from query 17)
delete from public.cradle_scores where id = 0;

-- 19. CHANGES DATA. Clear every score for one account, in every game (their initials stay saved)
delete from public.cradle_scores
where user_id = (select id from auth.users where email = 'their@email.com');

-- 20. CHANGES DATA. Reset one game's board for everyone ('bottles' or 'stork'; Daily Word is 'word')
delete from public.cradle_scores where game = 'bottles';

-- 20b. Daily Word: points, days played and won, by account (players see initials only)
select s.initials, u.email, sum(s.score) as points, count(*) as played,
       count(*) filter (where s.score > 0) as won, max(s.day) as last_played
from public.cradle_scores s
join auth.users u on u.id = s.user_id
where s.game = 'word'
group by s.initials, u.email
order by points desc;

-- 20c. CHANGES DATA. Remove one day's Daily Word result for one account (lets them post that day again)
delete from public.cradle_scores
where game = 'word' and day = '2026-10-12'
  and user_id = (select id from auth.users where email = 'their@email.com');


-- ============================================================
-- Notifications (after 3-notifications.sql; see docs/notifications.md)
-- ============================================================

-- 21. Phones that get feed-due notifications, by family
select h.name as family, u.email, s.lead_min as minutes_before, s.tz as time_zone,
       s.last_sent_due as last_announced_feed, s.fails, s.created_at,
       split_part(s.endpoint, '/', 3) as push_service
from public.cradle_push_subs s
join auth.users u on u.id = s.user_id
join public.cradle_households h on h.id = s.household_id
order by h.name, u.email;

-- 22. Is the schedule running? Last 5 runs of the cradle-notify job
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'cradle-notify')
order by start_time desc limit 5;

-- 22b. What did the function answer? 200 = working; 404 = the schedule's address doesn't
--      match the function's (it's case-sensitive). Kept by pg_net for about 6 hours.
select status_code, content, created
from net._http_response
order by created desc limit 5;

-- 23. CHANGES DATA. Stop notifications for one account's phones
delete from public.cradle_push_subs
where user_id = (select id from auth.users where email = 'their@email.com');

-- 24. CHANGES DATA. New notification keys. Every phone must turn notifications on again
--     afterward; the function makes a new key pair on its next run.
delete from public.cradle_push_subs;
delete from public.cradle_push_keys;


-- ============================================================
-- Profile pictures (v1.22)
-- ============================================================

-- 25. Who has a picture, what kind, and who can see it
select u.email, p.kind, p.preset, p.visibility, length(p.photo) as photo_chars, p.updated_at
from public.cradle_profiles p
join auth.users u on u.id = p.user_id
order by p.updated_at desc;

-- 26. CHANGES DATA. Remove someone's photo (they go back to the letter)
update public.cradle_profiles set kind = 'default', preset = null, photo = null, updated_at = now()
where user_id = (select id from auth.users where email = 'their@email.com');


-- ============================================================
-- Two-step sign-in (v1.25)
-- ============================================================

-- 27. CHANGES DATA. Reset someone's two-step sign-in (lost phone or authenticator app).
--     They sign in with just their password next time. If their family requires it, Cradle
--     then walks them through setting it up again.
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'their@email.com');

-- 28. Who uses two-step sign-in, and which families require it
select u.email, f.status, f.created_at
from auth.mfa_factors f join auth.users u on u.id = f.user_id
order by f.created_at desc;
select h.name, h.require_mfa, count(m.*) as people
from public.cradle_households h left join public.cradle_members m on m.household_id = h.id
group by h.id order by h.require_mfa desc, h.name;
