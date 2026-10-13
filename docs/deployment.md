# Deployment and architecture

How Cradle is deployed today, what each piece does, how to run it day to day, and why it's built the way it is. For first-time setup, see [Setup](setup.md). For the code and sync internals, see [How it works](how-it-works.md).

## The deployment at a glance

```
 GitHub: skboyce28/Cradle (main)
        │  every push
        ▼
 Netlify build ── python3 build_pwa.py
        │          reads CRADLE_SUPABASE_URL + CRADLE_SUPABASE_KEY (Netlify environment variables)
        ▼
 Netlify static site (HTTPS) ── index.html · sw.js · manifest.webmanifest · icons/
        │
        ▼
 Phones and browsers ── Cradle installed as an app, or opened in the browser
        │   log kept on each device (localStorage), works offline
        ▼   sync every ~15 s while open, over HTTPS
 Supabase project ── Auth (accounts, sign-in)  +  Postgres (the shared log)
                     reached directly through Supabase's REST API
        │
        └─ optional: pg_cron every minute ──▶ cradle-notify Edge Function ──▶ Web Push
                     (feed-due notifications; see notifications.md)
```

| Piece | Service | What it holds | Configured in |
|---|---|---|---|
| Source | GitHub, `skboyce28/Cradle` | Code, database scripts, docs. **No keys, no personal data.** | This repo |
| Build and hosting | Netlify, connected to `main` | The built web app, served over HTTPS | [`netlify.toml`](../netlify.toml) and Netlify's environment variables |
| Accounts and data | Supabase (free plan) | Sign-ins, families, and every log entry | [`supabase/`](../supabase/) scripts and Supabase's Authentication settings |
| The app | Each phone | A full copy of the family's log, plus sign-in tokens | Nothing to configure |

## Supabase

### Settings Cradle depends on

| Where in Supabase | Setting | Value |
|---|---|---|
| Authentication → Sign In / Providers | Allow new users to sign up | **On**, so people can create accounts in the app |
| Authentication → Sign In / Providers → Email | Confirm email | **Off**: Supabase's built-in email can't reach outside addresses |
| Authentication → URL Configuration | Site URL | Your Netlify address (only matters if you add email later) |
| Project Settings → Authentication → SMTP | Custom email sender | Not set. Optional; see [Setup](setup.md#optional-real-emails) |

### Schema

Built by these scripts, all safe to rerun in any order:

1. [`supabase/1-setup.sql`](../supabase/1-setup.sql): the log table.
2. [`supabase/2-family.sql`](../supabase/2-family.sql): families, share keys, Fun center high scores, Support feedback, and the security rules.
3. Optional, for [notifications](notifications.md): [`supabase/3-notifications.sql`](../supabase/3-notifications.sql) (tables and functions) and [`supabase/4-notify-schedule.sql`](../supabase/4-notify-schedule.sql) (the every-minute job), plus the [`cradle-notify`](../supabase/functions/cradle-notify/index.ts) Edge Function.
4. Optional, for the [status page](#status-page): [`supabase/5-status.sql`](../supabase/5-status.sql) (`cradle_status()` and the uptime and schema-history tables) and [`supabase/6-status-schedule.sql`](../supabase/6-status-schedule.sql) (checks the site every 5 minutes).

Each script except 4 adds a row to `cradle_schema_log` (script, version, time) when it runs, which the status page shows. When you change a script, update the version in its last line.

**Tables:**

| Table | Columns | Notes |
|---|---|---|
| `cradle_items` | `household_id` · `id` · `kind` · `data` (JSON) · `deleted` · `updated_at` · `owner` | One row per synced piece of the log. Primary key `(household_id, id)`. |
| `cradle_households` | `id` · `name` · `join_code` · `created_by` · `created_at` | One per family. `join_code` is the share key, like `K7QM-4XPD`. |
| `cradle_members` | `household_id` · `user_id` · `email` · `role` · `joined_at` | Who belongs to which family. `role` is `owner` or `member`. |
| `cradle_invites` | `household_id` · `email` · `invited_by` · `created_at` | Pending "add by email" invites |
| `cradle_join_tries` | `user_id` · `at` | Wrong share-key attempts, for the lockout of 10 per hour |
| `cradle_players` | `user_id` · `initials` · `updated_at` | Each account's 3 initials for the high-score boards |
| `cradle_profiles` | `user_id` · `kind` · `preset` · `photo` · `visibility` · `updated_at` | Profile pictures. `photo` is a small JPEG data URL (at most 16,000 characters). Only readable through `cradle_my_profile`, `cradle_family_pics`, and the boards, which apply `visibility`. |
| `cradle_scores` | `id` · `user_id` · `household_id` · `game` · `initials` · `score` · `seconds` · `created_at` · `day` · `detail` | Fun center scores. `seconds` is the round or flight length (up to an hour). `game` is `bottles` (Bottle Catch), `stork` (Stork Flight), or `word` (Daily Word, with its `day` and the grid as colors in `detail`; one per account per day). Only readable through `cradle_scores_board` and `cradle_word_board`, which show initials, scores, and colors only. |
| `cradle_feedback` | `id` · `user_id` · `household_id` · `kind` · `body` · `screenshot` · `app_version` · `device` · `status` · `reply` · `created_at` · `updated_at` · `reviewed_at` · `reviewed_by` | Support feedback. `kind` is `bug`, `idea`, or `question`; `status` is `new`, `reviewed`, `planned`, `used`, or `wontdo`. `body` is 3 to 4,000 characters, `reply` at most 2,000, `screenshot` an image data URL under 400,000 characters. Only reachable through the Support functions. |
| `cradle_admins` | `user_id` · `added_at` | Accounts that see the Feedback inbox. Added only in the SQL Editor (see [Support admins](#support-admins)). |
| `cradle_push_subs` | `endpoint` · `user_id` · `household_id` · `p256dh` · `auth` · `tz` · `lead_min` · `last_sent_due` · `fails` | Optional. One row per phone with notifications on. No app access; changed only through `cradle_push_subscribe` and `cradle_push_unsubscribe`. |
| `cradle_push_keys` | `public_key` · `private_jwk` | Optional. The notification (VAPID) key pair, made by the function on its first run. Only the service role can read it. |

**What goes in `cradle_items`:**

| `id` | `kind` | `data` example |
|---|---|---|
| `feed:k3j9x2a` | `feed` | `{"day":"2026-10-09","time":"07:05","left":true,"right":true,"start":"L","mins":28,"split":60,"bottle":49,"pump":75,"urine":false,"stool":true,"vitD":true,"note":""}` |
| `feed:p0q7m1z` | `feed` | A bath: `{"day":"2026-10-09","time":"19:00","bath":"tub","note":"Hair wash"}` |
| `day:2026-10-09` | `day` | `{"day":"2026-10-09","notes":"Lactation visit at 4pm.","vitD":false}` |
| `weight:w8d2` | `weight` | `{"id":"w8d2","date":"2026-10-07","time":"11:00","g":3380,"src":"Pediatrician","note":""}` |
| `settings` | `settings` | Goals, baby's name and birth date, Vitamin D start, feed interval, birth weight |

`split` is the percent of a both-sides feed's minutes on the left (missing means 50/50). Diaper-only rows are `feed` items with no breast, bottle, or pump. Deleting an entry keeps a marker (`deleted = true`), so other phones learn about the deletion.

**Security rules:**
- Row-level security is on for every table.
- Signed-in users can read and write `cradle_items` only for their own families, and can only read the family tables. The score tables aren't readable at all except through the board function.
- Every change to a family goes through `security definer` functions that check permissions themselves: `cradle_bootstrap`, `cradle_join`, `cradle_invite`, `cradle_new_code`, `cradle_remove_member`, `cradle_leave`, and others. The full list is in [How it works](how-it-works.md#rules-row-level-security).

**Triggers:** `cradle_touch` stamps `updated_at` with the server clock and records `owner` (the last editor) on every write.

### Admin queries

[`supabase/admin-queries.sql`](../supabase/admin-queries.sql) collects the queries for running Cradle, one at a time in the SQL Editor:

| # | Query |
|---|---|
| 1 | List accounts |
| 2, 3 | Confirm accounts stuck at "confirm your email" |
| 4 | Delete an account: done in the dashboard (Authentication, then Users); the file explains how |
| 5 to 7 | List families, see who's in one, find someone's family |
| 8 | New share key |
| 9 | Transfer ownership |
| 10 | Remove someone |
| 11 | Clear a share-key lockout |
| 12 to 14 | Read a family's log, count entries, count baths |
| 15 | Check storage |
| 16 | Tidy old deletion markers |
| 17 | Top scores in one game (Bottle Catch or Stork Flight), with the account behind each |
| 18 to 20 | Remove one score, clear one player's scores, or reset one game's board |
| 20b, 20c | Daily Word points by account; remove one day's result so someone can post that day again |
| 21 to 24 | Notifications: phones that get them, check the every-minute job (22) and what the function answered (22b), stop one account's phones, new notification keys |
| 25, 26 | Profile pictures: who has one and who can see it; remove someone's photo |
| 27, 28 | Two-step sign-in: reset someone's (lost phone); who uses it and which families require it |
| 29, 30 | Status page: the latest uptime checks; turn the checks off |
| 31 to 34 | Support: make someone an admin, list admins, remove an admin, read the feedback (with sender and family) |

Queries that change data are marked **CHANGES DATA**.

The one used most so far, confirming an account created while email confirmation was on:

```sql
update auth.users set email_confirmed_at = now()
where email = 'their@email.com' and email_confirmed_at is null;
```

### Support admins

Feedback sent from **💬 Support** goes to the accounts in `cradle_admins`. They see a **Feedback inbox** in the app (Support, then Feedback inbox) with each item's sender, family, version, and device; they set a status and an optional reply, which the sender sees. If an admin uses two-step sign-in, the inbox needs the code step too.

Make yourself an admin (admin query 31) in the SQL Editor after running `2-family.sql`:

```sql
insert into public.cradle_admins (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
```

Accounts made with a username have the email `username@cradle.cfg`. Nobody can add an admin from the app.

### Backups and limits

- **Back up from the app.** Profile menu → **Data management** → **Export data** saves a full backup file. This is the backup to rely on; the free plan has limited database backups.
- **The free plan pauses** a project after about a week without activity. Daily logging keeps it awake. A paused project is restored from the dashboard with nothing lost, and phones keep working offline meanwhile.
- **Storage is tiny.** A family's log is a few hundred rows a month, far below the free plan's database size. Query 15 shows current usage.

## Netlify

| Setting | Value |
|---|---|
| Repository | `skboyce28/Cradle`, branch `main` |
| Build command | `python3 build_pwa.py` (from `netlify.toml`) |
| Publish directory | `pwa` |
| Environment variables | `CRADLE_SUPABASE_URL` and `CRADLE_SUPABASE_KEY` (the **publishable** key); optional `CRADLE_DONATE_URL` for the Buy me a coffee button |
| Headers | Written by the build to `pwa/_headers`, which Netlify applies (below) |

**Headers on the hosted site:**
- **Security headers on every response:**
  - a Content-Security-Policy allowing only Cradle's own script and your Supabase project
  - plus no framing, `nosniff`, `no-referrer`, a Permissions-Policy, and HSTS
- **`Cache-Control: no-cache`** on the page and `sw.js`, so updates arrive promptly.

**Safety checks in the build:**
- **Missing variables stop the build.** If either variable is missing on Netlify, the build fails with a message saying what to add, and the last good deploy stays live. Users never see a version that asks them for database details.
- **A secret key stops the build.** The build refuses `sb_secret_…` and `service_role` keys.
- **No personal data ships.** The build strips any built-in starter log from `cradle.html`.
- **Security headers are generated, not hand-written.** The script's hash is recomputed on every build, so the policy always matches the code being deployed.

### Status page

`/status/` is built from [`docs/status.html`](status.html) with every deploy. Anyone with the link can open it; it shows counts and health, never names, emails, or log entries.

| Part | Comes from | Needs |
|---|---|---|
| Live version | `/version.json`, written by the build (version, commit, deploy time, branch, context) | Nothing |
| Deployments | The public GitHub API: commits on `main`, 10 at a time (**Show 10 older** goes back through the whole history, **Show fewer** returns to 10), each with its GitHub Actions test run. **🔗** next to a commit links to that deployment (`/status/#d-` plus the first 7 characters of the commit, like `/status/#d-b74d1d0`) and copies the link; opening it loads older pages until that deployment shows, then outlines it and scrolls to it. A commit that isn't on `main` says so. The repository comes from Netlify's `REPOSITORY_URL` (or `REPOSITORY_URL` in `.env`) | Nothing. GitHub allows 60 requests an hour per visitor without signing in; the page makes 2 every 5 minutes, plus 1 or 2 for each Show 10 older |
| Database, notifications, schema history | `cradle_status()`, called without signing in (as Supabase's anon role) | `5-status.sql` |
| Uptime | A pg_cron job asks the site for `/version.json` every 5 minutes through pg_net; the next run records the answer. Response times are approximate | `6-status-schedule.sql`, with your site's address |

The page refreshes the site and database every minute while it's open, and GitHub every 5 minutes (or when you tap **Refresh**). On a phone it shows the same layout as on a computer, zoomed to fit; pinch to zoom in. Its security policy allows connections only to the site, your Supabase project, and `api.github.com`.

**What it can't see:** checks run from one place (your Supabase project's region). If Supabase itself is down, no checks are recorded and those days show as no data. To check that it's working: `select at, ok, code, ms, err from public.cradle_probes order by at desc limit 5;`

### Deploys wait for tests

A push to `main` starts two things: GitHub Actions' tests and a Netlify build. Netlify's **ignore** step ([`tools/netlify_ignore.py`](../tools/netlify_ignore.py), set in `netlify.toml`) asks GitHub whether that commit's `test` job passed. While the tests are still running, or if they failed, it skips the build, so the live site doesn't change. When the tests pass, the workflow's **deploy** job calls a Netlify **build hook**, and Netlify builds and publishes. If someone pushed again in the meantime, the job leaves it to the newer commit's own run.

**Set up once:**
1. In Netlify: **Site configuration**, then **Build & deploy**, then **Continuous deployment**, then **Build hooks**, then **Add build hook**. Name it `GitHub tests passed`, branch `main`, and copy the address it gives you.
2. In GitHub: the repository's **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**. Name it `NETLIFY_BUILD_HOOK` and paste the address. Treat it like a password: anyone with it can start builds.

Without the secret, the deploy job warns and deploys nothing, and pushes skip their Netlify builds. A manual **Trigger deploy** in Netlify still works for a commit whose tests passed.

### Outside check

[`.github/workflows/monitor.yml`](../.github/workflows/monitor.yml) runs [`tools/monitor.py`](../tools/monitor.py) every 30 minutes from GitHub's servers, outside Netlify and Supabase:

| Check | Fails when |
|---|---|
| Site loads | The app page doesn't answer 200 with Cradle in it |
| Deployed version | `/version.json` is missing |
| Database answers | `cradle_status()` doesn't answer (Supabase down or paused). It reads the address and publishable key from the status page, so it needs no secrets |
| Uptime checks running | The 5-minute checks inside Supabase haven't run for 20 minutes (only if set up) |
| Notification job | Under 90% of the every-minute job's runs succeeded in 24 hours (only if set up) |
| Deploy up to date | `main`'s newest commit passed its tests more than 45 minutes ago but isn't live |

A failed check fails the run, and GitHub emails you about failed scheduled runs (check **Settings**, then **Notifications**, then **Actions** on your GitHub account). Each run's summary shows a table of results. Run it any time from the **Actions** tab (**Monitor**, then **Run workflow**).

**Set up once:** add the repository variable `CRADLE_SITE_URL` (your Cradle address, like `https://your-cradle.netlify.app`) under **Settings**, then **Secrets and variables**, then **Actions**, then **Variables**. GitHub pauses scheduled workflows after 60 days without any commits; it emails a warning first, and one click turns it back on.

**Rolling back:** in Netlify, open **Deploys**, pick an earlier deploy, then **Publish deploy**. Phones pick it up the next time Cradle opens.

**Deploy previews:** if you turn them on for pull requests, give the two environment variables the **All deploy contexts** scope, or preview builds will stop on the missing-variable check.

## The installed app

- **It's a progressive web app (PWA).** "Install app" in the profile menu, or the browser's own install option, adds it to the home screen. It opens full screen like a native app.
- **Offline support:** `sw.js` caches the app. Page loads try the network first, so updates arrive, and fall back to the cached copy offline. The cache name changes with every build.
- **Updates** reach a phone the next time Cradle opens with a connection.
- **Limits that come from being a web app:**
  - **No Clock alarms.** Phones don't let web apps create alarms in the Clock app, installed or not; **⏰ Set alarm** shows the time to set.
  - **Alarms need Cradle open.** Its own feed alarm rings only while Cradle is open.
  - **Notifications with the app closed need the optional setup.** See [Notifications](notifications.md). On iPhone, Cradle must be on the Home Screen.

## Releasing a change

1. Edit `cradle.html`. Bump `VERSION` and add to the About changelog inside it.
2. Update the in-app guide, the README, the guides in `docs/`, `CHANGELOG.md`, and the [overview page](overview.html) and screenshots when the change is visible.
3. Add or update a test in [`tests/`](../tests/) and run the suite (`cd tests && node run.mjs`; see [tests/README.md](../tests/README.md)). Also check in a browser at phone size.
4. Commit and push to `main`. GitHub Actions runs the tests; if they pass, it starts the Netlify deploy (see [Deploys wait for tests](#deploys-wait-for-tests)). A ❌ next to the commit means it wasn't deployed, and the last good version stays live.
5. If `supabase/2-family.sql` (or `3-notifications.sql`) changed, run it again in the SQL Editor. It's safe to rerun. If the notification function changed, deploy it again in Supabase.

## Architecture decisions

The main choices so far, why they were made, and what they cost.

| # | Decision | Why | Trade-off |
|---|---|---|---|
| 1 | **One HTML file, no framework or libraries** | Nothing to install or update, fast on old phones, easy to read and back up. | One large file. Discipline needed to keep it organized. |
| 2 | **Offline-first:** every phone keeps the whole log and syncs small items | Logging at 3am can't wait for a signal. | Entries merge field by field (three-way, against the last synced copy), so edits to different boxes of the same row both survive. Two phones changing the *same* box within about a second: the later upload wins. |
| 3 | **Supabase free plan, called directly over REST**, no server code of our own | Real accounts and a real database with no server to run or pay for. No SDK keeps the app dependency-free. | Bound by free-plan limits (pausing, email). Sync and auth code is hand-written. |
| 4 | **Security enforced in the database:** row-level security plus permission-checking functions | A modified copy of the app still can't reach other families' data. The publishable key can be public. | Schema changes need care, and are tested before release. |
| 5 | **Families with share keys and open sign-up** | Friends and family set themselves up without the admin creating accounts. | Anyone with the link can make an account (but only ever sees their own empty family). |
| 6 | **Email confirmation off; usernames allowed** (stored as `name@cradle.cfg`) | Supabase's built-in email can't deliver to outside addresses. | Emails aren't verified. No password-reset email; the admin helps instead. Share keys, not emails, decide family access. |
| 7 | **Invites by email only for accounts that already existed when invited** | With unverified emails, a stranger could otherwise register someone's address and take their invite. | Invites are rarely needed; share keys are the main path. |
| 8 | **Keys in environment variables, never in the repo** | Keeps project details out of the code history. | The publishable key is still visible in the hosted page; that's by design and safe. |
| 9 | **Netlify builds from GitHub and fails without the keys** | Every push that passes its tests deploys (decision 23). A broken config never goes live. | Netlify's environment variables are one more place to keep right. |
| 10 | **A web app (PWA) instead of a native Android app** | One codebase for every phone, instant updates, no app store. | No Clock alarms. Notifications while closed need the optional Web Push setup (decision 17). |
| 11 | **Diaper-only rows, baths, tummy time, and sleep share the feed list; `isFeed()` decides what counts** | Simple data model; everything syncs, exports, and imports the same way. | Every feed calculation must use `isFeed()`. |
| 12 | **Personal starter log stripped at build** | The author's copy can preload real data without it reaching the public site. | The public copy keeps the block empty (`{}`). |
| 13 | **PolyForm Noncommercial license** | Free for families, friends, and charities; no commercial reuse without permission. | Not "open source" by the official definition. |
| 14 | **Built with AI assistance (Claude), tested in a simulation** | Fast iteration. Each feature is checked with a real Postgres database running the real scripts, a stand-in for Supabase's API, and Chromium playing several phones. The suite lives in [`tests/`](../tests/) and runs on every push with GitHub Actions. | A simulation isn't the real Supabase or a real phone, and nothing has had an independent security review. Netlify deploys even if the tests fail, so check the ✅. |
| 15 | **Fun center high scores checked by the server, shown as initials only** | Scores post from the phone, so the server is the only place to enforce rules. Initials keep the shared board fun without exposing who anyone is. Daily Word points are worked out by the server from the grid, and the board only stores colors, never letters. | The checks stop impossible and spammy scores, but a careful cheater could still post a believable fake. Only the best queued offline score posts. Daily Word's answers ship inside the app, so they aren't secret from someone who looks. |
| 16 | **Strict security headers generated at build time; Erase all data for owners; a sign-out that clears the phone** | Blocks injected or outside scripts and data leaving for other sites. Protects the family log from an accidental wipe. Gives shared or lost phones a clean exit. | Styles still allow inline CSS, since the app uses it everywhere (lower risk than scripts). Owner-only erase is an app check, not a database rule. |
| 17 | **Notifications by Web Push from a Supabase Edge Function, run every minute by pg_cron** | The only way a web app can alert a phone that's closed. It stays inside the same free Supabase project with nothing new to sign up for. The function creates its own keys and uses the project's built-in service key, so no secret is ever copied by hand. Due times are worked out in Postgres, in each phone's time zone. | Optional setup (about 10 minutes). Arrives up to a minute late. Only knows about feeds that have synced. On iPhone, Cradle must be on the Home Screen. The function runs without JWT verification so the schedule can start it; extra starts do nothing, since each feed is announced once per phone. |
| 18 | **Daily Word picks the word on the phone, from built-in lists, by date** | Works offline, needs no server for play, and everyone with the same length gets the same word. Each person picks 4, 5, or 6 letters, so the family can play at their own level. Lists come from SCOWL under a permissive license (see [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)). | Adds about 110 KB to the page. The day follows each phone's own date, so for a few hours around midnight two time zones can be on different words. Changing the lists would change future words, so the build script only appends. |
| 19 | **Profile photos stored in the database, not Supabase Storage** | The phone shrinks a photo to a 112-pixel square (about 5 KB), so it fits in a table row. That needs no storage bucket or storage rules to set up, and the same database functions that check families decide who sees it. | Photos are small and square. Each board load carries the visible photos along, which is fine at this size. |
| 20 | **The product overview is published at `/overview/`, with its own security policy** | One link to share that introduces Cradle, kept in step with the repo on every deploy. The app's strict policy stays on the app's files; the overview gets its own, which also allows Google Fonts and nothing else (no connections, no other scripts). The service worker leaves `/overview/` alone, so visiting it never replaces the offline copy of the app. | Anyone who has your site's address can read the overview (it has no personal data, just example screenshots). |
| 21 | **Two-step sign-in with Supabase's authenticator apps (TOTP), enforced by a restrictive row rule; the family owner can require it** | Supabase includes it free and keeps the secrets; the app only adds screens. The database checks the sign-in's `aal2` level, so a stolen password alone can't read the log, even with a modified app. An owner-wide rule fits how families share one log. | No backup codes or SMS: a lost authenticator app needs the operator to reset it (admin query 27). Each phone asks for a code once per sign-in, not on every open. |
| 22 | **A public status page fed by the build, the GitHub API, and one anon database function; uptime checks from pg_cron** | Shows deploys, uptime, and backend health with no new service, account, or secret. The data the page can read is limited to counts in one security-definer function. | Checks come from one region inside Supabase, so a Supabase outage shows as missing data rather than as down. Response times are approximate. GitHub limits anonymous visitors to 60 requests an hour. |
| 23 | **Deploys wait for tests: Netlify's ignore step skips untested commits; a build hook from GitHub Actions deploys after they pass. An outside check every 30 minutes** | A failing test can't reach families, and problems inside Supabase or Netlify still get noticed, with an email. Both use free features already in use. | One secret (the build hook) and one variable to set in GitHub. A deploy now takes about as long as the tests (about 12 minutes). GitHub's scheduled runs can start a few minutes late and pause after 60 days without commits. |
