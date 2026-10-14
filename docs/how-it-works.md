# How it works

For anyone reading, changing, or reviewing the code. For how it's deployed and why it's built this way, see [Deployment and architecture](deployment.md).

## The app

- **One file.** `cradle.html` holds all the HTML, CSS, and JavaScript. There's no framework, no build step for the code itself, and no external libraries, fonts, or analytics. Charts are inline SVG. The only network requests go to your own Supabase project.
- **State.** The whole log is one object kept in `localStorage` under `cradle-feeding-v1`:
  - `days`: keyed by date (`YYYY-MM-DD`); each day has `feeds`, `notes`, and a Vitamin D flag. Rows in `feeds` are feeds, diaper-only rows, baths (`bath`: sponge or tub), or sleep (`sleep: true`, `time` asleep, `end` awake or empty while asleep, `mins`), or tummy time (`tummy: true` with `mins`); only real feeds count as feeds (`isFeed()`)
  - `weights`, `milk` (stored milk: when pumped, mL, container, `fridge` / `freezer` / `thawed`, optional label, and `done` once used), `settings`, plus UI preferences
  - `migrate()` upgrades older saved shapes when the app loads
- **Game state.** Fun center settings live in the log's UI preferences. For Bottle Catch, your best score per account, remembered initials, and scores waiting to post (from rounds played offline) live under `cradle-game-v1`. For Stork Flight, your best score and most deliveries in one flight per account, and flights waiting to post, live under `cradle-stork-v1` (the initials are shared with Bottle Catch). For Daily Word, each account's chosen length, hard mode, practice word, and about a year of days (guesses, result, and whether it posted) live under `cradle-word-v1`. Neither is part of the log, exports, or sync. **Erase all data** and **Sign out and remove from this phone** clear all three.
- **Daily Word.** The word lists are a JSON block in the page (`wordData`): for each length, the answers and the other allowed guesses, each a run of fixed-length words. The day's word is `answers[(days since 2026-10-12) mod count]` for the phone's own date, so everyone who picks the same length gets the same word, and it changes at local midnight. Colors follow the usual rule for repeated letters (greens first, then yellows up to the number left). [`tools/words/build_words.py`](../tools/words/build_words.py) builds the lists from SCOWL and never reorders words already published.
- **Sync state.** Sign-in and sync bookkeeping live separately under `cradle-cloud-v1`: session tokens, the family id, the last sync time, and a fingerprint of each item as last synced. It also keeps your picture (`pic`) and your family's pictures (`fpics`) so the profile button shows yours right away; they're refreshed from the database every 10 minutes at most.
- **Day of life.** The birth date in Settings is **Day 0**. Diaper goals are computed from it.
- **Left and right split.** A feed with both sides has `split`, the percent of its minutes on the left (0 to 100, in steps of 5). Missing means 50/50; a one-side feed is all on that side. `sideMins()` turns minutes and split into whole minutes per side, used by the Dashboard, the chart explorer, the day sheet, and the doctor report.
- **Feeds vs. other rows.** A 🧷 diaper-only row (no breast, bottle, or pump) and a 🛁 bath row (`bath: "sponge"` or `"tub"`, plus `time` and `note`) live in the same `feeds` list but never count as feeds in stats, streaks, gaps, or the next-feed time. `isFeed()` checks for `bath` first.

### The installable build

`build_pwa.py` turns `cradle.html` into the hosted app in `pwa/`:

- Removes the `baseData` block, an optional starter log for personal copies, so personal data can't reach a public site
- Bakes in `CRADLE_SUPABASE_URL` and `CRADLE_SUPABASE_KEY` from the environment or a git-ignored `.env`, and refuses secret keys
- Bakes in the optional `CRADLE_DONATE_URL` (an `https://` link only), which shows the Buy me a coffee button; without it the button stays hidden
- Writes `manifest.webmanifest` and copies the icons
- Writes `_headers` with the site's security headers (see [Security](#security))
- Writes `sw.js`, a service worker whose cache name is a hash of the page. Page loads try the network first (so updates arrive) and fall back to the cached copy offline. It also shows [feed-due notifications](notifications.md) and opens Cradle when one is tapped.

## Sync

The log is split into small **items**, each synced on its own:

| Item id | Holds |
|---|---|
| `feed:<id>` | One row from a day's log (a feed, a diaper-only row, or a bath), plus its date |
| `day:<YYYY-MM-DD>` | That day's notes and Vitamin D flag |
| `weight:<id>` | One weight |
| `milk:<id>` | One stored container of milk |
| `settings` | Shared settings: goals, baby name, birth date and weight, Vitamin D start, feed interval, and what you track (breast, bottle, pump) |

Theme, weight units, the alarm switch, and layout preferences stay per phone.

### Each round

A round runs when the app opens, about a second after any save, every 15 seconds while the app is on screen, and when the phone comes back online:

1. **Bootstrap** (first round after sign-in, then every 5 minutes): ask the database which family this account belongs to. It creates a family if there isn't one, and accepts any pending invite. If the answer says this sign-in still needs two-step sign-in (`mfa_ok` is false), the round stops and Cradle shows the code step, or the setup screen when the family requires it.
2. **Pull:** download items changed since the last pull (`updated_at >= last`) and apply them, merging any that this phone has also changed (see below).
3. **Push:** compare every local item with its fingerprint from the last sync, and upload only what changed. A deletion is uploaded as a tombstone (`deleted = true`), so other phones remove it too.

Pulling before pushing means a phone always merges in other people's edits before it uploads its own.

**Conflicts.**
- **A phone's first sync with a family:** the server's copy wins for items both sides have, then items only on the phone are uploaded. That's how a phone's existing log merges into a family.
- **After that:** items merge **field by field**. When a pulled item has also changed on this phone, Cradle compares three versions: the last synced copy (the fingerprint), this phone's, and the server's. A field only one side changed takes that change; a field both changed keeps this phone's value, which then uploads and becomes everyone's. So if one person adds the bottle while another types a note on the same feed, both stay.
- **Deletes:** a delete on this phone wins over an edit from elsewhere. An edit here to an entry deleted elsewhere brings it back.
- **The one gap:** two phones uploading the same field within the same second or so (between one's pull and its push). The later upload wins.

**While typing.** A pull never redraws the box you're typing in. The rest of the Log is rebuilt around your row, and the other boxes in your row are refreshed, so nothing on screen shows an old value. When someone else's change arrives, a toast names them (from the `owner` column) and the changed rows flash.

**Offline.** Saves always go to the phone first. Failed rounds just retry later; nothing is lost while offline.

**Tokens.** Sign-in uses Supabase Auth's REST API directly. The access token is refreshed before it expires; if refreshing fails, the app asks you to sign in again. After a password sign-in, Cradle reads the account's authenticator apps (`GET /auth/v1/user`); if one is verified, it asks for the code and exchanges it (`/auth/v1/factors/{id}/challenge`, then `/verify`) for a token marked `aal2`, which refreshing keeps.

## Database

Two scripts in `supabase/` build the schema. Both are idempotent and safe to rerun in any order. Others are optional: `3-notifications.sql` and `4-notify-schedule.sql` for [notifications](notifications.md), `5-status.sql` and `6-status-schedule.sql` for the [status page](deployment.md#status-page), and `7-owlet.sql` and `8-owlet-schedule.sql` for the [Owlet Dream Sock](owlet.md).

### Tables

| Table | Purpose |
|---|---|
| `cradle_items` | Every synced item. Primary key `(household_id, id)`. Columns: `kind`, `data` (JSON), `deleted`, `updated_at` (set by the server), and `owner`, the account that last saved it. |
| `cradle_households` | Families: `name`, `join_code` (the share key), and `require_mfa` (the owner requires two-step sign-in) |
| `cradle_members` | Who belongs to which family, with role `owner` or `member` |
| `cradle_invites` | Pending "add by email" invites |
| `cradle_join_tries` | Wrong share-key attempts, for rate limiting |
| `cradle_players` | Each account's 3 initials for the high-score boards |
| `cradle_profiles` | Each account's picture: `default` (the letter), a built-in `preset`, or a `photo` (a small JPEG as a data URL, at most 16,000 characters), and who may see it (`me`, `family`, or `everyone`) |
| `cradle_scores` | Fun center scores: account, family at the time, game (`bottles`, `word`, or `stork`), initials, score, round length in seconds, and for Daily Word the day and the grid as colors only (like `5h:01200/22222`: 5 letters, hard mode, 0 gray, 1 yellow, 2 green). One Daily Word result per account per day. |
| `cradle_feedback` | Support feedback: who sent it and their family at the time, kind (`bug`, `idea`, `question`), the text, an optional screenshot (a JPEG data URL), app version and device, and the review: `status` (`new`, `reviewed`, `planned`, `used`, `wontdo`), `reply`, and when and by whom it was reviewed |
| `cradle_admins` | Accounts that may read and review feedback. Only added in the SQL Editor. |
| `cradle_schema_log`, `cradle_probes`, `cradle_status_config` | Optional, from `5-status.sql`: which scripts ran and when, uptime checks, and the site address to check. No direct access from the app. See [the status page](deployment.md#status-page). |
| `cradle_terms`, `cradle_terms_acceptances` | Recommended, from `9-terms.sql`: each version of the terms with the SHA-256 of its text, and each person's acceptances (version, fingerprint, server time, app version). Only ever added to. No direct access from the app. See [Terms and privacy](accounts-and-families.md#terms-and-privacy). |
| `cradle_owlet`, `cradle_owlet_tries` | Optional, from `7-owlet.sql`: each family's Owlet sock (serial number, time zone, the latest state, and Owlet's sign-in tokens encrypted with a key that only the Edge Function has), and connection attempts. No direct access from the app. See [Owlet Dream Sock](owlet.md). |
| `cradle_push_subs`, `cradle_push_keys` | Optional, from `3-notifications.sql`: phones that get feed-due notifications, and the notification keys. See [Notifications](notifications.md#how-it-works). |

A trigger (`cradle_touch`) stamps `updated_at` with the server's clock and records `owner` on every write, so phones with wrong clocks can't confuse sync. Deleting an account clears `owner` on its entries but **never deletes entries**.

### Rules (row-level security)

Every table has row-level security on.

- **`cradle_items`:** you can read and write a row only if its `household_id` is one of your families, via `cradle_my_households()`. You also can't write a row into a family you're not in.
- **Terms on `cradle_items`** (with `9-terms.sql`): a third restrictive rule calls `cradle_terms_ok()`, which passes once this person has accepted the current terms version (or when none is set up). Until then they see no rows and can't write any; the app shows the terms instead.
- **Two-step sign-in on `cradle_items`:** a second, *restrictive* rule (both must pass) calls `cradle_mfa_ok(household_id)`. It passes when the sign-in finished the code step (`aal2` in the token), or when the account doesn't use two-step sign-in and its family doesn't require it. So a password-only sign-in of someone who uses it, or of anyone in a family that requires it, sees no rows and can't write any.
- **Families, members, invites:** you can only *read* rows for your own families. You can't write them directly at all.
- **`cradle_join_tries`, `cradle_players`, `cradle_scores`, `cradle_profiles`, `cradle_feedback`, `cradle_admins`:** no direct access from the app; only through the functions below.

All changes to families go through these functions, which check permissions themselves and are callable only by signed-in users:

| Function | Who | Does |
|---|---|---|
| `cradle_bootstrap()` | anyone signed in | Accepts invites for your email, returns your family (creating one if needed) |
| `cradle_family_info(h)` | members | Name, share key, people (each with whether they use two-step sign-in), pending invites, `require_mfa`, and `mfa_ok` (whether this sign-in may see the log). The share key is left out until `mfa_ok`. |
| `cradle_join(code)` | anyone signed in | Joins the family with that key. Wrong keys are counted; 10 in an hour locks joining for that hour. |
| `cradle_invite(h, email)` / `cradle_uninvite` | members | Adds or cancels an invite for an **existing** account |
| `cradle_rename(h, name)` | members | Renames the family |
| `cradle_new_code(h)` | owner | New share key; the old one stops working |
| `cradle_remove_member(h, user)` | owner | Removes someone |
| `cradle_leave(h)` | members | Leaves the family |
| `cradle_set_mfa_policy(h, on)` | owner, signed in with the code | Requires two-step sign-in for everyone in the family, or stops requiring it. Refused unless the owner uses it and finished the code step. |
| `cradle_mfa_on(user)`, `cradle_mfa_ok(h)`, `cradle_mfa_check(h)` | used by the rules and functions only | Whether an account has a verified authenticator app (`auth.mfa_factors`); whether this sign-in passes; and the check that stops invites, renaming, new keys, and removing people until the code step is done |
| `cradle_scores_board(game)` | anyone signed in | The three boards: Everyone (each person's best, top 10), Our family (top 10), My best (top 10), plus your initials and rank. Only initials and scores. |
| `cradle_my_profile()` / `cradle_set_profile(kind, preset, photo, visibility)` | anyone signed in | Reads or saves your own picture. Refuses anything that isn't a built-in name or a small JPEG, WebP, or PNG data URL. Choosing the letter or a built-in picture deletes a stored photo. |
| `cradle_family_pics(h)` | members | The pictures in your family that you may see, by account |
| `cradle_pic(user)` | used inside the functions above only | Someone's picture if the caller may see it: their own, `everyone`, or `family` when they share a family. The high-score boards use it too. |
| `cradle_set_initials(initials)` | anyone signed in | Saves your 3 initials and updates your past scores |
| `cradle_submit_score(score, seconds, initials, game)` | anyone signed in | Posts a Bottle Catch (`bottles`) or Stork Flight (`stork`) score. Refuses Bottle Catch rounds over 130 seconds or more than 100 points per second played, Stork Flight flights over an hour or more than 40 points per second, posting within 10 seconds of your last score, more than 200 scores a day, and initials on a short blocklist. |
| `cradle_word_board(day)` | anyone signed in | Daily Word boards: Everyone (total points, top 10, with current streak), Our family (totals and each person's grid for that day), My days (your last 10), plus your totals and rank. Only initials, points, and colors. |
| `cradle_submit_word(day, len, rows, hard, initials)` | anyone signed in | Posts a Daily Word result. Works out the points itself (70 for 1 guess down to 20 for 6, +10 hard, 0 if not solved), checks the grid is possible (1 to 6 rows of the right length, solved only on the last row, 6 rows if not solved) and that the day is within a day of today, and takes one result per account per day. |
| `cradle_submit_feedback(kind, body, screenshot, version, device)` | anyone signed in | Sends Support feedback, recording the family you're in. Refuses other kinds, text under 3 or over 4,000 characters, a screenshot that isn't an image data URL or is over 400,000 characters, and more than 10 a day. |
| `cradle_my_feedback()` | anyone signed in | Your last 50 with status and reply (the screenshot only as yes/no), whether you're an admin, and for admins the number of new ones |
| `cradle_feedback_inbox(status)`, `cradle_feedback_shot(id)`, `cradle_feedback_review(id, status, reply)` | admins (with the code step if they use two-step sign-in) | The inbox (everyone's feedback with email, family, and counts by status, filtered by status); one screenshot; set the status and reply. Setting it back to New clears the review. |
| `cradle_is_admin()`, `cradle_admin_check()` | used inside the functions above only | Whether the caller is in `cradle_admins`; the check that refuses everyone else |
| `cradle_terms_status()` / `cradle_terms_accept(version, sha256, app_version)` | anyone signed in | The current version and fingerprint, whether you've accepted it and when, and your history. Accepting only works for the current version with its exact fingerprint, and records it once |
| `cradle_status()` | anyone, without signing in | Counts and health for the status page: schema history, database size, families in use (the one each account currently opens) and how many are shared, accounts, entries, the notification job's last 24 hours, and uptime. No names, emails, or entries. |
| `cradle_probe()`, `cradle_status_set_site(url)` | the schedule only | Records and starts uptime checks; sets the site address |
| `cradle_push_info(endpoint)` | anyone signed in | Optional notifications: the public notification key, and this phone's setting |
| `cradle_push_subscribe(…)` / `cradle_push_unsubscribe(endpoint)` | anyone signed in | Turns notifications on or off for one phone, in the caller's current family |
| `cradle_owlet_status(h)` | members | Optional Owlet: the sock's name, the masked account, who connected it, its state (asleep, awake, charging, off), battery, when it was checked, and any problem. Never the tokens. |
| `cradle_owlet_check(h)`, `cradle_owlet_disconnect(h)` | members past the code step | Called by the Edge Function with the person's own sign-in before it connects: refuses unless the family requires two-step sign-in (`require_mfa`) and this sign-in finished the code step, and allows 10 tries an hour. Disconnecting deletes the stored tokens |
| `cradle_owlet_save(…)`, `cradle_owlet_due()`, `cradle_owlet_tokens(…)`, `cradle_owlet_fail(…)`, `cradle_owlet_record(h, state, battery)` | the cradle-owlet function only (service role) | Saves a connection, claims the families to check (each at most every 50 seconds, skipping families that no longer require two-step sign-in, which pauses them), stores renewed tokens, records problems, and turns readings into sleep entries in `cradle_items` (when the family tracks sleep) |
| `cradle_push_due()`, `cradle_push_result()`, `cradle_push_get_keys()`, `cradle_push_set_keys()` | the cradle-notify function only (service role) | Finds phones to tell, records results, and manages the notification keys |

Share keys are 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as `XXXX-XXXX`: about 850 billion combinations.

An invite can only be claimed by an account that **existed when the invite was made**. Because sign-ups don't verify email, this stops a stranger from registering someone else's address after you invite it.

## Security

**What protects the data:**
- **The database, not the app,** decides who sees what. A modified copy of Cradle with the same publishable key still can't read or change another family's rows.
- **The publishable key** only identifies your project. It's built into the hosted page, so anyone who opens your site can see it; it's kept out of the repo (in `.env` or Netlify's environment variables) so project details stay out of the code history.
- **Security headers** on the hosted site, written by `build_pwa.py` into `pwa/_headers`:
  - a **Content-Security-Policy** that only runs Cradle's own inline script, allowed by its SHA-256 hash
  - network connections limited to the site itself and your Supabase project
  - no plugins or embedding in other sites (`frame-ancestors 'none'`, `X-Frame-Options: DENY`)
  - `nosniff`, `Referrer-Policy: no-referrer`, a Permissions-Policy that turns off microphone, location, and payment and allows the camera only for Cradle itself (for scanning milk labels), and HSTS

  Even if someone found a way to inject a script into the page, the browser wouldn't run it, and couldn't send data anywhere else.
- **Two-step sign-in** (optional per person, or required by the family owner) uses Supabase's authenticator-app sign-in (TOTP). Supabase stores the secrets and checks the codes; the app calls `/auth/v1/factors` to set one up, challenge, and verify, and reads the `aal` level from the token. The database rule above, not the app, is what keeps a password-only sign-in out.
- **The secret key** (`sb_secret_…` or `service_role`) bypasses every rule. It must never be in this repo, the app, or a chat. The app never uses it. The two optional Edge Functions (`cradle-notify`, `cradle-owlet`) do, and Supabase gives it to them automatically, so it's never copied anywhere. The build refuses a secret key.
- **Integrations never see a person's Cradle sign-in, and the app never sees an integration's.** Owlet's tokens stay in the database, encrypted with a key only the `cradle-owlet` function has; the notification keys stay in a table only the service role can read. See [How each connection is authenticated](#how-each-connection-is-authenticated) and the [keys and secrets list](deployment.md#keys-and-secrets).

### How each connection is authenticated

| From → to | How it authenticates | What it's allowed to do |
|---|---|---|
| Phone → Supabase Auth | Email or username and password (`/auth/v1/token?grant_type=password`; new accounts through `/auth/v1/signup`). With two-step sign-in, a 6-digit code next (`/auth/v1/factors/{id}/challenge`, then `verify`), which raises the session from `aal1` to `aal2`. The access token (a JWT, about an hour) and the refresh token are kept on the phone and renewed with `grant_type=refresh_token`. Sign out calls `/auth/v1/logout` | Get a session for one person |
| Phone → database (REST and RPC) | The publishable key plus the person's access token | Only the rows of their own families (row-level security), only past the code step where it's required (the restrictive rule), and only the checked functions granted to `authenticated` |
| Phone → `cradle-owlet` (Connect) | The same publishable key and access token, sent to the function, which passes them on to `cradle_owlet_check` so that check runs **as the person**, not as the service role | Connect a sock only if they're in the family, the family requires two-step sign-in, this sign-in finished the code step, and it's under 10 tries an hour |
| pg_cron → `cradle-notify`, `cradle-owlet` | None: JWT verification is off so the schedule can call them. Inside, each function uses the service key for its own database calls | Start a run. Runs are safe to repeat (notifications are sent once; each sock is checked at most every 50 seconds), and the answers are counts only |
| `cradle-owlet` → Owlet | Once, at Connect: the Owlet email and password to Google's sign-in (Owlet's login provider), which returns a refresh token. Each check: refresh token → Google ID token → Ayla mini token → Ayla access token (about a day, cached encrypted). Requests carry Owlet's own app identifiers, as Owlet's app does | Read the one connected sock: sleep state, charging, battery |
| `cradle-notify` → push services | A VAPID JWT (ES256) for each push, with the message encrypted for the phone (RFC 8291) | Deliver to phones that subscribed |
| Status page and outside check → database | The publishable key, without signing in (the `anon` role) | Call `cradle_status()`, which returns counts and health only |
| GitHub Actions → Netlify | The build hook address, a repository secret | Start a build (which still only builds commits that passed their tests) |
| Netlify's build → GitHub | None (the public API) | Read whether a commit's tests passed |

**What to know:**
- **Email isn't verified** when confirmation is off, so an email address on an account proves nothing. Share keys, not emails, decide who joins a family.
- **Username accounts** (`name@cradle.cfg`) can't receive password-reset emails.
- **The project owner** can see all data in the Supabase dashboard.
- **On a phone**, the log is stored unencrypted in the browser, like any website's saved data. Anyone who can unlock the phone and open Cradle can see it. **Sign out and remove from this phone** clears it, after syncing.
- **Erase all data** is limited to the family owner in the app. It's a safeguard against accidents, not a database rule: members can still delete entries one at a time, which everyday logging needs.
- **The hosted build removes the starter-log block**, and the build fails if it can't. Personal starter data belongs only in a local copy, never in a commit.

**Review status:** the database scripts and the app are tested in a simulated setup, with the suite in [`tests/`](../tests/) running on every push:
- a real Postgres 16 database running these scripts
- stand-ins for Supabase's sign-in service
- an automated browser playing several phones

That testing covered:
- families staying separate
- the owner-only actions
- two-step sign-in (real 6-digit codes, the family rule, and password-only sign-ins being refused)
- the Owlet connection against a stand-in for Owlet's sign-in and API: only encrypted tokens stored, the two-step requirement, pausing, and counts-only answers
- share-key lockout
- invite claiming
- reruns of the scripts in any order
- offline merge
- account switching on one phone

It's **not** an independent security audit. See [DISCLAIMER.md](../DISCLAIMER.md).

## Working on the code

- **Edit `cradle.html` directly.** Keep it dependency-free.
- **Personal starter log:** to preload a log in your own copy, put it in the `<script type="application/json" id="baseData">` block. The format is the same as an export file plus a `baseVersion` number. Keep the committed file's block as `{}`.
- **Bump `VERSION`** and add to the changelog in the About dialog and in `CHANGELOG.md`.
- **Database changes** go in `supabase/2-family.sql` (or `3-notifications.sql` for notifications), written so they're safe to rerun (`if not exists`, `create or replace`, `drop … if exists`).
- **Build:** `python3 build_pwa.py`, then serve `pwa/` over http(s) to test install and offline. For example: `python3 -m http.server -d pwa 8080`.
- **Tests:** `cd tests && npm ci && node run.mjs` runs over 300 checks against a throwaway Postgres. GitHub runs the same suite on every push. See [tests/README.md](../tests/README.md).
