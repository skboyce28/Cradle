# Tests

Over 300 automated checks that run on every push (see [`.github/workflows/tests.yml`](../.github/workflows/tests.yml)). A ✅ or ❌ next to each commit on GitHub shows the result. Click it for the details.

## What they cover

| File | What it checks |
|---|---|
| `sync-merge.test.mjs` | Two phones editing the same log: field-by-field merge, typing while changes arrive, deletes, who-changed-what notes, editing weights |
| `game.test.mjs` | Bottle Catch: pause, scoring, initials, the three high-score boards, server-side limits |
| `stork.test.mjs` | Stork Flight: hovering until the first tap, flapping, pausing, crashing, posting, the three-way game switch, server-side limits, offline posting, the Night Flyer badge |
| `avatar.test.mjs` | Profile pictures: built-in and uploaded, who can see them (only me, family, everyone) on the Family screen and the boards, deleting a photo, database checks; and the Night shift button |
| `word.test.mjs` | Daily Word: the word lists, the day's word worked out separately, colors, too-short and unknown words, hard mode, points and posting, one result per day, a second phone, the family and Everyone boards, practice, offline posting, switching boards |
| `erase-and-wipe.test.mjs` | Owner-only Erase all data, and Sign out and remove from this phone |
| `security-headers.test.mjs` | The built site under its real security headers: no policy violations, sync still works |
| `doctor-report.test.mjs` | The doctor report, with every daily row recomputed from the log by separate code |
| `tracking.test.mjs` | What you track: Breast, Bottle, and Pump switches hide the right parts everywhere, and desktop columns stay lined up |
| `dashboard-filter.test.mjs`, `menu.test.mjs`, `achievements.test.mjs`, `split.test.mjs`, `bath.test.mjs`, `learning-center.test.mjs`, `halloween.test.mjs`, `holiday-themes.test.mjs`, `donate.test.mjs` | One feature each |
| `notify/crypto.test.mjs` | Notification encryption against the RFC 8291 example, byte for byte, and the VAPID signature |
| `notify/round.test.mjs` | A full notification round against a fake push service that decrypts each message |
| `notify/entry.test.mjs` | The cradle-notify function's Supabase entry point |
| `notify/settings.test.mjs` | Turning notifications on and off in Settings, and a push shown by the service worker |

## How they run

`run.mjs` does everything:
1. Sets up a test database:
   - a small stand-in for Supabase's auth (`support/auth-shim.sql`)
   - Cradle's real scripts from `supabase/` (1 to 3; the every-minute schedule in 4 needs Supabase's pg_cron, so it's left out)
2. Builds the site three times with fake settings.
3. Starts local servers:
   - `support/supabase-standin.mjs`, a stand-in for Supabase's API
   - `support/site-server.mjs` twice (ports 8099 and 8098), stand-ins for Netlify that apply `_headers`
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
