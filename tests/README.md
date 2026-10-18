# Tests

Over 300 automated checks that run on every push (see [`.github/workflows/tests.yml`](../.github/workflows/tests.yml)). A ✅ or ❌ next to each commit on GitHub shows the result. Click it for the details.

## What they cover

| File | What it checks |
|---|---|
| `sync-merge.test.mjs` | Two phones editing the same log: field-by-field merge, typing while changes arrive, deletes, who-changed-what notes, editing weights |
| `game.test.mjs` | Bottle Catch: pause, scoring, initials, the three high-score boards, server-side limits |
| `laundry.test.mjs` | Laundry Day: start screen, countdown, swiping and tapping baskets, wrong baskets and drops, streak multipliers, pausing, a full round, posting, boards and the game switch, server limits, and the badges |
| `stork.test.mjs` | Stork Flight: hovering until the first tap, flapping, pausing, crashing, posting, the three-way game switch, server-side limits, offline posting, the Night Flyer badge |
| `avatar.test.mjs` | Profile pictures: built-in and uploaded, who can see them (only me, family, everyone) on the Family screen and the boards, deleting a photo, database checks; and the Night shift button |
| `mirror.test.mjs` | Baby mirror: opens the front camera mirrored and full screen, frames and zoom (remembered), buttons fade and come back, press-and-hold to close, the camera turns off on close and in the background, and the message when camera access is refused |
| `milk.test.mjs` | Milk storage: adding to the freezer and fridge, oz to mL, CDC age flags, rules, freeze, thaw, undoing a freeze or thaw (Undo thaw asks after 10 minutes), use as a bottle feed, undo, labels (find, unknown label, typing just the 5 letters, scanning with a pretend barcode reader, printing Code 128, label pictures on whole printer dots with thinner bars, Cradle's own barcode reader on sharp, blurry, upside-down, and small pictures, and a real camera scan from a video file on a phone with no barcode reader), syncing to another phone, export |
| `mfa.test.mjs` | Two-step sign-in: setting it up, wrong and right codes, the code step on a new phone, the owner's require-it rule, setting it up when required, turning it off, and the database refusing password-only sign-ins |
| `status.test.mjs` | The status page: uptime checks through a pg_net stand-in (answered, unanswered, kept 100 days), what the anon role can and can't reach, version.json, the page under its own security policy with a stand-in GitHub API, paging and links to one deployment, banner states, and phone width |
| `weights.test.mjs` | Weight entry in grams or lb and oz: weighted feeds, switching units, the Weights screen, birth weight |
| `word.test.mjs` | Daily Word: the word lists and meanings, the keyboard (⌫ left, Enter right), the meaning after a win or loss, the day's word worked out separately, colors, too-short and unknown words, hard mode, points and posting, one result per day, a second phone, the family and Everyone boards, practice, offline posting, switching boards |
| `erase-and-wipe.test.mjs` | Owner-only Erase all data, and Sign out and remove from this phone |
| `pump-only.test.mjs` | Pumping alone isn't a feed: a pump-only row is marked ⚡, isn't counted, doesn't reset Since last feed, still counts in Pumped; adding a bottle makes it a feed |
| `security-headers.test.mjs` | The built site under its real security headers: no policy violations, sync still works |
| `deploy-gate.test.mjs` | Deploys wait for tests: the Netlify ignore step against a stand-in GitHub API (running, failed, passed, rerun, GitHub down, previews); the outside check against the built site and the Supabase stand-in (healthy, a tested commit stuck, a failed commit kept back, uptime checks stopped, notification job failing, site down) |
| `doctor-report.test.mjs` | The doctor report, with every daily row recomputed from the log by separate code |
| `tummy.test.mjs` | Tummy time: the timer and typed minutes, not counting as feeds, one timer at a time, earlier days, the goal in Settings, the Log tile, the Dashboard tile, chart, filter, and insight, History, the day sheet, the doctor report, export and import |
| `support.test.mjs` | Support: sending a bug with a screenshot (shrunk to a JPEG), kinds, too-short text, the admin's new count and Feedback inbox (sender, family, device, screenshot, filters), a status and reply the sender sees, the update mark, Quality Assurance and Compliance Officer, and the database refusing non-admins, direct reads, non-image screenshots, and more than 10 a day |
| `sleep.test.mjs` | Sleep: off until turned on, Asleep and Woke up on the Log and in Night shift, typed times, a sleep across midnight split between days, naps vs night, the wake window, the goal, the Log tile, the Dashboard tile, chart, filter, and insight, History, print, the doctor report, export and import, and turning it off again |
| `owlet.test.mjs` | Owlet Dream Sock: requires the family to require two-step sign-in (the app's gate, the database's refusal, a password-only sign-in locked out, pause and resume when the rule is turned off and on); the scheduled answer is counts only; turning on Sleep asks about a sock (Yes shows the form at once; No leaves the 🦉 Dream Sock box greyed, tickable later, never asked again); the real `cradle-owlet` function code against a stand-in Owlet sign-in and API; connecting in Settings (wrong password, two socks), only encrypted tokens stored (bound to the family), no vitals, the 3- and 5-minute holds, a sleep someone started kept, charging, token renewal, being signed out by Owlet, Sleep turned off, and the database's limits |
| `terms.test.mjs` | Terms and privacy: the same text and version in `docs/terms.md`, the app, and `9-terms.sql` (with its SHA-256); the terms after sign-up; acceptance recorded with version, fingerprint, time, and app version; the database hiding and refusing the log until then; a wrong fingerprint refused; a new version asking again (and an older app saying to reload); About |
| `tracking.test.mjs` | What you track: Breast, Bottle, and Pump switches hide the right parts everywhere, and desktop columns stay lined up |
| `dashboard-filter.test.mjs`, `menu.test.mjs`, `achievements.test.mjs`, `split.test.mjs`, `bath.test.mjs`, `learning-center.test.mjs`, `halloween.test.mjs`, `holiday-themes.test.mjs`, `donate.test.mjs` | One feature each |
| `notify/crypto.test.mjs` | Notification encryption against the RFC 8291 example, byte for byte, and the VAPID signature |
| `notify/round.test.mjs` | A full notification round against a fake push service that decrypts each message |
| `notify/entry.test.mjs` | The cradle-notify function's Supabase entry point |
| `notify/settings.test.mjs` | Turning notifications on and off in Settings, and a push shown by the service worker |

## How they run

`run.mjs` does everything:
1. Sets up a test database:
   - a small stand-in for Supabase's auth (`support/auth-shim.sql`), with its users and authenticator-app tables
   - Cradle's real scripts from `supabase/` (1, 2, 3, and 5; the schedules in 4 and 6 need Supabase's pg_cron, so they're left out; small stand-ins for pg_net and pg_cron let the status functions run)
2. Builds the site four times with fake settings.
3. Starts local servers:
   - `support/supabase-standin.mjs`, a stand-in for Supabase's API, including the authenticator-app (two-step sign-in) endpoints; `support/totp.mjs` makes and checks the 6-digit codes
   - `support/site-server.mjs` three times (ports 8099, 8098, and 8097 for the status page), stand-ins for Netlify that apply `_headers`
4. Runs each `*.test.mjs`. Most drive Chromium; `notify/crypto`, `notify/round`, and `notify/entry` run in plain Node.

A test file passes when it prints no `FAIL` lines and no page errors. Logs and screenshots go to `tests/out/` (not committed).

`fixtures/` holds example logs for a made-up baby. Never put real data there.

## Running them on your computer

You need Node 22 or later, Python 3, and a **throwaway** Postgres 15 or later. Don't use a real Supabase project: the setup adds test accounts and tables.

```sh
cd tests
npm ci
npx playwright install chromium
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node run.mjs
```

- **Run only some tests:** `node run.mjs notify sync` runs files whose names contain those words.
- **Use your own Chromium:** set `CHROME_PATH=/path/to/chrome`.
- **Ports used:** 54321 (Supabase stand-in), 8098 and 8099 (sites), and 8765 (fake push service).
