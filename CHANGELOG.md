# Changelog

## Netlify build fix (no app change)

- v1.33's Netlify builds failed with **Exposed secrets detected**: Netlify's smart secret scanning flagged the Owlet app identifiers (Google-style API keys and Ayla app IDs) in the `cradle-owlet` Edge Function, so v1.33 and v1.34 never went live. They're public values built into Owlet's app, and the function runs on Supabase, not in the published site. `netlify.toml` now allows exactly those four values and that one file (`SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES`, `SECRETS_SCAN_OMIT_PATHS`); scanning stays on for everything else

## v1.34

**Sleep and Dream Sock setup**
- **Turning on 😴 Sleep** in Settings asks *Do you have an Owlet Dream Sock?* (once per family). **Yes, set it up** shows the connect form right away; **No** doesn't
- **Sleep settings appear as soon as Sleep is ticked** (the goal and the Owlet form), with no save and reopen
- **🦉 Dream Sock** box beside 😴 Sleep in What you track, greyed out until ticked. Tick it later to set up a sock; untick it while connected and Cradle asks whether to disconnect. The choice is shared with the family
- **Connecting a sock saves Sleep as on** right away, so sleep is logged even if Settings is closed without Save
- **Overlapping sleeps count once:** the Log's Sleep tile, Dashboard, History, and doctor report merge sleeps that overlap (one tapped by hand and one from the sock, say) before adding up
- Tests: `owlet.test.mjs` (43 checks) covers Yes, No, ticking later, and unticking; `sleep.test.mjs` (33) checks the merge

## v1.33

**Owlet Dream Sock (optional)**
- With **😴 Sleep** on, **Settings** has a **🦉 Owlet Dream Sock** section: enter the Owlet email and password, pick the region, and **Connect** (choose the sock if the account has more than one). One person connects it for the whole family
- A new **cradle-owlet** Edge Function checks each connected sock about once a minute (`8-owlet-schedule.sql`). After 3 minutes asleep it adds a sleep row marked **from Owlet**; after 5 minutes awake, off, or charging it fills in the wake time and length. A sleep someone already started with 😴 Asleep is used instead of adding another
- The Log's asleep or awake line shows the sock's status (asleep, awake, charging, off) and when it was checked. Settings shows the sock, the masked account, who connected it, battery, any problem, **Refresh**, and **Disconnect**
- **Security:** the password is used once and never stored. Owlet's sign-in token is encrypted (AES-GCM, tied to the family) with `CRADLE_OWLET_KEY`, a secret only the Edge Function has. The app can't read the connection table, only `cradle_owlet_status()`. Heart rate and oxygen are discarded, never stored or shown. 10 connection tries an hour
- **Setup** (once, by whoever runs the Supabase project): `7-owlet.sql`, the `CRADLE_OWLET_KEY` secret, the `cradle-owlet` function (JWT verification off), and `8-owlet-schedule.sql`. See [docs/owlet.md](docs/owlet.md)
- **Unofficial:** Owlet has no public API. This uses the calls Owlet's app makes (as documented by the open-source pyowletapi library), so it can stop working if Owlet changes them
- New test: `tests/owlet.test.mjs` (34 checks), with a stand-in Owlet service. The test database's auth stand-in now handles requests with no one signed in, as Supabase does
- `tests/word.test.mjs`: the hard-mode "out of guesses" check now searches for six valid wrong guesses up front, since some days' 6-letter words left too few when picked one at a time

## v1.32

**Sleep (optional)**
- **Turn it on in Settings**, under What you track: **😴 Sleep** (off to start). It's shared with the family. Turning it off hides it everywhere and deletes nothing
- **😴 Asleep** under Since last feed adds a sleep with the current time; the button becomes **☀️ Woke up**, which saves the wake time and length. A sleep in progress syncs, so every phone shows the baby asleep and anyone can tap Woke up
- **Wake window:** the line under Since last feed shows *Asleep 1h 35m since 2:40pm* or *Awake 1h 05m since 4:15pm*
- Each sleep row has a start and a wake time to type or change. Sleeps starting 7pm to 7am are **night sleep** (🌙), others **naps** (😴). A sleep across midnight is split between the two days. Sleep never counts as a feed
- **Daily goal** in Settings: *Sleep goal (hours a day)*, 15 to start, 0 turns it off
- **Log:** a Sleep tile with a ring toward the goal, naps and night. **Night shift:** a 😴 Asleep / ☀️ Woke up button
- **Dashboard:** *Sleep per day* (over the days with sleep logged, goal met, longest stretch, today so far), a *Daily sleep* chart of night and naps with the goal line, an insight, and a **😴 Sleep** filter chip
- **History**, the **day sheet**, and the **doctor report** include sleep when it's on. Export and import keep sleeps, the switch, and the goal
- New test: `tests/sleep.test.mjs` (31 checks)

## Status page: a link to each deployment

No change to the app.
- **🔗** next to each deployment's commit links straight to it (`/status/#d-` plus the first 7 characters of the commit, like `/status/#d-b74d1d0`) and copies the link
- Opening a link loads older deployments as needed (up to 20 pages), then outlines that row and scrolls to it. A commit that isn't in `main`'s history says so
- `tests/status.test.mjs`: 3 new checks (33)

## v1.31

**Support**
- **💬 Support** in the profile menu (next to Guide and About): send a **Bug or problem**, an **Idea or request**, or a **Question**, with an optional screenshot (shrunk on the phone to at most 1280 pixels, as a JPEG). The Cradle version, phone type, browser, installed or not, screen size, account, and family go with it, and the form shows exactly what's included
- **Your feedback** lists what you've sent with its status (New, Reviewed, Planned, Used, or Won't do) and any reply. A number on Support means there's an update
- **Feedback inbox for admins:** accounts in the new `cradle_admins` table see the number of new ones on Support and an inbox to filter by status, read the sender, family, version, and device, load the screenshot, and set a status with a short reply. Admins who use two-step sign-in need the code step
- **Two achievements** in a new Support group (55 in all): **Quality Assurance** (feedback that gets reviewed; Won't do counts) and **Compliance Officer** (five reviewed)
- **Database** (`2-family.sql`, rerun it): tables `cradle_feedback` and `cradle_admins`, and the functions `cradle_submit_feedback`, `cradle_my_feedback`, `cradle_feedback_inbox`, `cradle_feedback_shot`, and `cradle_feedback_review`. No direct access to either table; 10 a day per account; text, reply, and screenshot sizes are limited. Admins are added in the SQL Editor (admin query 31)
- New test: `tests/support.test.mjs` (26 checks)

## v1.30

**Tummy time**
- **🤸 Tummy time** under Since last feed adds a tummy time row with the current time and starts its timer. **■** stops it and saves the minutes (to the nearest minute, at least 1). You can also type the minutes, add a note, or tap ▶ to time another stretch on the same row. Only one tummy time timer runs at a time; starting another stops the first. On an earlier day, the row has no timer, so enter the time and minutes. The running timer is kept on the phone, like the nursing timer
- Tummy time rows **never count as feeds**: feed counts, gaps, and the next feed are unchanged
- **Daily goal** in Settings: *Tummy time goal (minutes a day)*, 15 to start, 0 turns it off. It's shared with the family like the other goals
- **Log:** a *Tummy time* tile next to Bath, with a ring that fills toward the goal and turns green when it's met, the number of sessions, and whether the timer is running
- **Dashboard:** a *Tummy time per day* tile (average over completed days, how many met the goal, today so far), a *Daily tummy time* chart with the goal line (tap to enlarge; the table adds a Tummy min column), an insight, and a **🤸 Tummy time** filter chip
- **History** (🤸 tag and a Tummy column), the **day sheet**, and the **doctor report** (a column and the daily average) include it. Export and import keep tummy time rows and the goal
- New test: `tests/tummy.test.mjs` (26 checks)

## Deploys wait for tests, and an outside check

No change to the app.
- **Only tested commits deploy.** `netlify.toml` now has an ignore step (`tools/netlify_ignore.py`) that skips Netlify's build for a push until GitHub Actions' `test` job has passed for that commit. A new **deploy** job in `tests.yml` starts the build through a Netlify build hook once the tests pass (and leaves a commit alone if a newer one was pushed meanwhile). A failed test run now keeps the last good version live. Needs the repository secret `NETLIFY_BUILD_HOOK`
- **Outside check every 30 minutes** (`.github/workflows/monitor.yml`, `tools/monitor.py`), from GitHub's servers: the site, `/version.json`, the database (through `cradle_status()`, using the status page's own settings), the uptime checks inside Supabase, the notification job, and whether a tested commit is stuck waiting to deploy. A failure fails the run, and GitHub emails you. Needs the repository variable `CRADLE_SITE_URL`
- New test: `tests/deploy-gate.test.mjs` (14 checks), with a stand-in GitHub API

## Status page and overview updates

No change to the app.
- **Deployments are paged:** the 10 most recent show first. **Show 10 older** goes back through the whole history (test results for older ones load as needed), and **Show fewer** returns to 10
- **Automated tests** replaces "Tests on main": it says it's the GitHub Actions run on every push to main, and the deployments column reads *GitHub Actions tests*
- **Phones get the computer layout**, zoomed to fit (pinch to zoom in), instead of a stacked phone layout. Phone browsers no longer enlarge some paragraphs
- GitHub is asked every 5 minutes instead of every minute, so a page left open stays within GitHub's 60 requests an hour for visitors who aren't signed in. **Refresh** still updates everything
- **Families in use:** the Families count was every family ever created, including the solo family each account starts with and keeps after joining someone else's. It now counts the family each account currently uses, and also shows how many are shared by 2 or more people. Rerun `5-status.sql` (or the snippet in the docs)
- **Clearer wording:** "Last change synced 50 min ago" read like syncing had stopped. It now says when someone last added or edited a log entry, and "Changes, 24 h" reads "Entries added or edited, 24 h"
- **The product overview** (`/overview/`) also shows its computer layout on phones, zoomed to fit
- status.test.mjs: 29 checks

## v1.29

- **Weight chart:** a weighted feed now shows both weights: the before weight as an open circle (as before), and the after weight as a filled dot above it, joined by a dashed line. Tapping the dot shows the after weight and how much was taken (1 g ≈ 1 mL). The legend reads *Weighted feed: before* and *after (with the milk)*. The after weight includes the milk just taken, so only before weights count toward Latest, Lowest, and Back to birth weight
- The chart's last day label no longer runs off the right edge
- weights.test.mjs: 2 more checks

## v1.28 fixes

- **Uptime checks:** the address saved for the checks keeps only `https://` and the host, so pasting a page address like `…/status/` no longer makes every check a 404. The status page now names the address it checks and, when a check gets a 404 while the site answers, says the address is probably wrong
- **Tests:** the milk storage test entered "today" times like 6:00am, which are in the future when the tests run just after midnight (GitHub runs them in UTC), so the 9:10pm Eastern push failed. Those entries are now a set number of minutes in the past

## v1.28

**Status page at `/status/`**
- A public status page, built and deployed with the site, that anyone with the link can open. It shows counts and health only: no names, emails, or log entries
- **Components:** Website, Database, Notifications, and Tests on main, each with a state (operational, needs attention, not reachable, not set up), and a summary banner. Website and Database are also measured live from the viewer's browser
- **Uptime:** percentages for 24 hours, 7 days, and 30 days, average and 95th-percentile response times, a 90-day strip (one bar per UTC day), and recent failed checks
- **Deployments:** the live version from a new `/version.json` (version, commit, deploy time, and context, written by the build from Netlify's `COMMIT_REF`, `BRANCH`, and `CONTEXT`), and the last 15 commits on `main` from the public GitHub API with each one's test run, the live one marked
- **Database:** size against the free plan's 500 MB, families, accounts, entries, changes in 24 hours, and schema history
- **New `supabase/5-status.sql`** (optional): `cradle_status()`, the one function the page calls without signing in, plus tables for uptime checks and schema history. **New `supabase/6-status-schedule.sql`** (optional): checks the site's `/version.json` every 5 minutes with pg_cron and pg_net. Edit your site's address into it before running
- **Schema history:** scripts 1, 2, 3, 5, and 6 now record their version and when they ran in `cradle_schema_log`. Rerunning `1-setup.sql`, `2-family.sql`, and `3-notifications.sql` fills it in
- The status page has its own security policy: it can connect only to the site itself, your Supabase project, and `api.github.com`. The app's service worker leaves `/status/` and `/version.json` alone
- About links to the status page
- New test: `tests/status.test.mjs` (23 checks), with stand-ins for pg_net and pg_cron and a stand-in GitHub API. The Supabase stand-in now also answers calls made without signing in, as Supabase's anon role

## v1.27

**Milk storage: units and label printers**
- The amount box has an **mL / oz** switch next to it. On iPhone the number keyboard has no letters, so "4 oz" couldn't be typed. The choice is remembered on each phone (oz to start when weights are in lb), switching converts what's in the box, and Edit shows the amount in that unit. (Shipped first as a quick fix)
- **Print labels** now asks which kind: **Label printer, 40 × 14 mm** (the NIIMBOT P21 and similar) or **Sheet of labels** for a regular printer. The choice is remembered
- For the label printer, Cradle makes a 960 × 336 picture of each label (three times the printer's 320 × 112 dots, so bars land on whole dots): the baby's name and amount, a Code 128 barcode, and the code with the date and time pumped. **Share or save** sends them to the phone's share sheet (to save them to Photos, for example); each also has **Download**. Print them from the printer's app as a picture. Checked with a separate barcode reader at full size and at the printer's resolution
- A label written like `10/10/2026 - 8 A` or `10/9/26 7:30 PM`, typed or scanned, fills in the date and time pumped
- Several containers can share a label (milk pumped together); saving a label that's already in storage asks first instead of refusing
- Printing straight to the label printer over Bluetooth isn't included: iPhone browsers can't use Bluetooth printers, and the P21 isn't among the models the open-source NIIMBOT protocol work supports, so it couldn't be built or checked reliably
- milk.test.mjs now 47 checks

## v1.26

**Milk storage**
- **Milk storage** in the profile menu (after Weights): pumped milk in the fridge and freezer. Each container records when it was pumped, the amount (a number, with an **mL / oz** switch next to the box), the container (storage bag, bottle, tray or cubes, other), an optional label, and a note. **How many** adds several identical containers at once
- Totals for the freezer, fridge, and thawed milk, in mL and oz; the menu shows the total stored
- Oldest first, with CDC limits: fresh milk 4 days in the fridge; frozen best within 6 months, fine up to 12; thawed 24 hours, never refrozen. Rows turn amber when it's time to use them and orange when they're past the limit, and the oldest frozen milk is marked **Use first**
- **Freeze** (fridge to freezer, refused after 4 days), **Thaw** (freezer to fridge, starts the 24 hours), and **Use**: log a bottle feed now with that amount, mark it used, or throw it away. **Recently used** keeps the last 10, with **Undo**
- **Labels**: type the label on your bag; tap 📷 to scan a barcode or QR code where the browser can (Chrome on Android, for example; it uses the browser's built-in barcode reader); or **Print labels**, which gives containers without one a code like `CM-7KQ2M` and prints a sheet of Code 128 barcode labels with the amount and date. **Find by label** filters the list, and Enter (or a Bluetooth scanner) jumps to that container, or starts a new one with that label
- Syncs to the whole family like the rest of the log, and is included in export and import. No database change
- The site now allows the camera for Cradle itself (`Permissions-Policy: camera=(self)`), for scanning; other sites still can't use it
- The profile menu puts Guide and About on one row so it still fits on a phone
- The overview has a Milk storage card (Diapers, Vitamin D, and baths now share one, so the grid stays at nine)
- New test: `tests/milk.test.mjs` (37 checks). The printed labels were also checked with a separate barcode reader

## v1.25

**Two-step sign-in**
- After the password, Cradle can ask for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Passwords on iPhone). It uses Supabase's built-in authenticator-app sign-in (TOTP), which is free and on by default
- **Profile, then Sign-in and security** (the new home of Change password too, keeping the menu the same length): set it up with a QR code, an **Add to authenticator app** link for the same phone, or the setup key; turn it off again (unless your family requires it). The menu shows **On** when it's on
- **The code step**: on a phone that signs in with a password, Cradle asks for the code before showing the log. Six digits submit by themselves
- **Family rule**: the family owner can tick **Require it for everyone in this family** under Family, once they use it themselves. Anyone who hasn't set it up is shown the setup screen the next time they open Cradle, and the Family screen marks who has it on
- **Enforced by the database**: `supabase/2-family.sql` adds `require_mfa` to families, a second (restrictive) rule on the log, and `cradle_set_mfa_policy`. A password-only sign-in of someone who uses two-step sign-in, or is in a family that requires it, can't read or write the log, see the share key, or change the family. Rerun `2-family.sql` in the SQL Editor
- No backup codes (Supabase doesn't have them). Admin query 27 resets someone's two-step sign-in if they lose their phone; 28 lists who uses it
- Test stand-in: Supabase's authenticator endpoints, real 6-digit codes, and `aal` in tokens. New test: `tests/mfa.test.mjs` (31 checks)

## Product overview refresh

No change to the app.
- The overview now reads like an app preview: "The baby log the whole family shares", with the Log in the middle of the hero and History and the Dashboard beside it
- A "What's inside" grid of nine features replaces the triple-feeding explainer (triple feeding is one line under Feeds, your way)
- The Fun center picture stacks all three games, Stork Flight on top
- New screenshots for Bottle Catch, Stork Flight, and Achievements (53 badges); `tools/screenshots/take.mjs` retakes them
- Every picture is now a real app screenshot: the made-up 24-hour feed clock and diaper-goal chart are gone, replaced by "Patterns at a glance" with the Dashboard's Feeding rhythm chart and a list of the charts in the app

## v1.24

**The product overview is on the web**
- The build now publishes [docs/overview.html](docs/overview.html) and its screenshots at your Cradle's address plus `/overview/` (for example `https://your-cradle.netlify.app/overview/`). It's one link to share that introduces Cradle, and it updates with every deploy
- **About** in the app links to it
- It has its own security policy (Google Fonts and nothing else), and the app's offline service worker leaves it alone, so visiting it never replaces the app's offline copy
- The security-headers test now also checks the overview page

## v1.23

**Weights in grams, or pounds and ounces**
- Weighted feeds, the Weights screen, and the birth weight in Settings now have number boxes instead of one text box: **g**, or **lb** and **oz** side by side, with the number keyboard on phones. No typing "lb" or "oz"
- A **g / lb oz** switch next to the boxes changes units. Whatever you've typed converts, and weights everywhere follow (it's the same as Settings > Show weights in)
- In grams, a small number like 3.27 is read as kilograms (3270 g)
- Weights are still saved in grams, so nothing already logged changes
- New test: `tests/weights.test.mjs` (17 checks)

## v1.22

**Profile pictures**
- **Your picture**, at the top of the profile menu: upload a photo, keep the letter, or pick a built-in picture (Dad, Mom, Person, Bear, Bunny, Fox, Owl)
- Photos are cropped to a square and shrunk on the phone to about 5 KB before saving
- **Who can see it:** Only me, Me and my family (to start), or Everyone on this Cradle. Everyone also shows it next to your initials on the high-score boards. The database decides who gets it; everyone else sees the letter
- Shown on the profile button and the Family screen. Choosing the letter or a built-in picture deletes a stored photo

**Night shift** is now a 🍼 button at the top right, next to the moon, instead of a tab. The tabs are Log, Dashboard, and History.

**For whoever runs your Cradle:** run [`supabase/2-family.sql`](supabase/2-family.sql) again. It adds the `cradle_profiles` table and the functions `cradle_my_profile`, `cradle_set_profile`, `cradle_family_pics`, and `cradle_pic`, and puts pictures on the high-score boards. Safe to rerun. New admin queries 25 and 26.

- New test: `tests/avatar.test.mjs` (22 checks); the Night shift tests now use the button

## v1.21

- The day's totals on the Log are now in pairs on a phone: **Feeds** and **Vitamin D**, **Pumped** and **Bottle**, **Wet** and **Stool**, then **Bath**. Before, Vitamin D sat alone at the end and the diaper rings were split across rows.

## v1.20

**The bottle target is per feed, and now says so everywhere**
- It always worked per feed (each bottle's bar, the chart line, the Dashboard's hit rate, and the Full Bottle badges), but the labels didn't say so, and the Log's Bottle card showed the day's total right next to "target"
- Now: **Bottle target per feed** in Settings; "Avg 45 mL per bottle feed · target 30 mL per feed" on the Log; "30 mL target per feed" on the chart; "% of bottle feeds hit 30 mL" on the Dashboard; "Bottle target: 30 mL per feed" on the printed day sheet; and "Reach the 30 mL bottle target in a feed" on the Full Bottle badges

**Achievements:** the Bottle Catch badges are renamed **Catch Pro** and **Catch Legend**, so Catch Legend isn't confused with the bottle-feeding badge Bottle Legend. Earned badges stay earned.

No database changes.

## v1.19

**Stork Flight** (in the Fun center)
- Tap to flap a stork carrying a bundle through the gaps between the clouds and the chimneys of a sleeping town
- **Points:** +10 for each gap, +5 for a star, and +25 more for a delivery (passing a house with a lit window)
- The stork hovers until your first tap. The first gaps are wide; then they move, narrow, and come faster. One bump ends the flight
- Pauses itself when you switch away or the feed alarm rings. Sound starts off; Buzz and Sound are on the start screen. Space or the up arrow flaps on a computer
- High scores like Bottle Catch (Everyone, Our family, My best), with the same initials. Flights played offline post when you're back online

**High scores:** the game switch at the top now has all three games.

**Achievements:** 3 new Fun center badges (53 in all): Night Flyer (250 in one flight), Sky Captain (1,000), and Special Delivery (10 deliveries in one flight).

**Also:** Bottle Catch's start screen has a Close button.

**For whoever runs your Cradle:** run [`supabase/2-family.sql`](supabase/2-family.sql) again. It lets `cradle_submit_score` take Stork Flight scores (flights up to an hour, at most 40 points a second) and raises the `seconds` limit on `cradle_scores` to an hour. Bottle Catch keeps its 130-second rounds. Until it's run, Stork Flight scores wait on the phone.

- New test: `tests/stork.test.mjs` (26 checks)

## v1.18

**Daily Word** (in the Fun center)
- A new word every day at midnight. Guess it in 6 tries, with green, yellow, and gray letters and a keyboard that shows what you've found
- **Each person picks 4, 5, or 6 letters.** Everyone who picks the same length gets the same word that day
- **Hard mode:** found letters must be used in later guesses, for 10 extra points
- **Points:** 70 for solving in 1 guess down to 20 in 6, 0 if not solved. Stats for played, win %, streak, best streak, and guesses per win
- **Share** copies your colored squares (no letters). **Practice** gives unlimited random words with no points
- Stop mid-word anytime; your guesses are saved on the phone. One result per account per day: another phone shows the result instead of a new game
- Real words only: about 3,100, 6,400, and 10,700 allowed words for 4, 5, and 6 letters, and common words as answers (no plurals or past tenses, nothing rude or grim). From SCOWL; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). [`tools/words/build_words.py`](tools/words/build_words.py) builds them

**High scores for both games**
- The High scores screen has a switch for **Bottle Catch** and **Daily Word**. Both use the same 3 initials
- Daily Word boards: **Everyone** (total points, with 🔥 streaks), **Our family** (totals, plus each person's grid for today, colors only, hidden until you've played), and **My days**
- Results played offline post when you're back online (within about a day)

**Achievements:** 10 new Fun center badges (50 in all, in eight groups): First Word, Word Lover, Wordsmith, Week of Words, Month of Words, Lucky Guess, Hard Mode Hero, Every Length, Bottle Pro, and Bottle Legend. They count the games played on each phone by whoever is signed in.

**For whoever runs your Cradle:** run [`supabase/2-family.sql`](supabase/2-family.sql) again in the SQL Editor. It adds two columns to `cradle_scores` and the functions `cradle_word_board` and `cradle_submit_word`, and now limits the 10-second Bottle Catch posting gap to Bottle Catch. Safe to rerun. New admin queries 20b and 20c.

- New tests: `tests/word.test.mjs` (36 checks), plus updates to the achievements and Bottle Catch tests

## Notification setup guide

No change to the app.
- [Notifications](docs/notifications.md) setup: the schedule must call the function's web address **exactly as Supabase shows it**, capitals included. A function created as `Cradle-notify` keeps that address even after renaming it in the dashboard.
- New check after scheduling: a SQL query that shows what the function answered (200 working, 404 address mismatch, 401 JWT verification still on). Also added as admin query 22b and in the comments of `4-notify-schedule.sql`.

## v1.17

**What you track**
- New in Settings: **🤱 Breast**, **🍼 Bottle**, and **⚡ Pump** switches. Turn off what your family doesn't use and Cradle hides it everywhere:
  - the Log's boxes and column headers (desktop columns stay lined up), the Bottle and Pumped tiles, and the pump timer
  - Night shift's timer, L/R, and bottle buttons. With Breast off, Start feed no longer starts a nursing timer.
  - the Dashboard's tiles, charts, side balance, the Bottle & pump filter, and insights
  - the printed day sheet and the doctor report's columns and averages
- Shared with the family through sync, included in exports and imports, and at least one stays on
- Nothing logged is deleted; turning a part back on brings it all back
- New test: `tests/tracking.test.mjs` (18 checks)

## Tests in the repo

No change to the app.
- The automated tests now live in [`tests/`](tests/): 18 files and about 250 checks
  - one runner: `cd tests && node run.mjs`
  - it sets up a throwaway Postgres with Cradle's real scripts, builds the site, and starts stand-ins for Supabase's API and Netlify's headers
  - it runs Chromium as several phones
- **GitHub Actions** runs them on every push and pull request ([`.github/workflows/tests.yml`](.github/workflows/tests.yml)), with a ✅ or ❌ next to each commit and a badge on the README
- The doctor report test now recomputes every daily row from the log. The game test no longer depends on random play or leftover scores.
- Test data is a made-up baby, and the test accounts are made up

## v1.16

**📣 Feed-due notifications** (optional; see [docs/notifications.md](docs/notifications.md))
- Each phone can turn on **Notify this phone, even when Cradle is closed** in Settings: when a feed is due, or 15 or 30 minutes before
  - Works on Android in Chrome or the installed app, and on iPhone once Cradle is on the Home Screen (iOS 16.4 or later)
  - Settings explains what's missing when it can't be turned on yet
- "🍼 Feed due in 15 min · Juniper" with the due and last-feed times. A newer notification replaces the older one, and tapping it opens Cradle.
- The due time is the family's last feed plus **Feed every**, worked out on the server in each phone's own time zone
  - Baths and diaper-only rows don't count
  - Each feed is announced once per phone, and nothing is sent once a feed is more than 2 hours overdue
- Each phone's subscription is refreshed when Cradle opens, so a new time zone or family is picked up

**Setup, for whoever runs the Cradle** (about 10 minutes, all in the Supabase dashboard)
- [`supabase/3-notifications.sql`](supabase/3-notifications.sql): the phones table, the keys table, and the functions
  - The app can only add or remove its own phone
  - Only the function can read the private key or the list of phones
  - A phone is only told about the family it's in now
- [`supabase/functions/cradle-notify/index.ts`](supabase/functions/cradle-notify/index.ts): the Edge Function that sends them
  - Standard Web Push (VAPID and aes128gcm) with the built-in Web Crypto API
  - Creates its own keys on its first run and uses the project's built-in service key, so no key is copied by hand
  - Phones that unsubscribed are removed automatically
- [`supabase/4-notify-schedule.sql`](supabase/4-notify-schedule.sql): runs it every minute with pg_cron and pg_net
- The service worker shows the notifications. Admin queries 21 to 24 list phones, check the schedule, and reset.

**Tested** with a real Postgres database:
- the encryption matches the RFC 8291 example byte for byte, and the VAPID signature verifies
- a full round against a fake push service that decrypts each message, covering timing, repeats, a new feed, overdue feeds, unsubscribed phones, and permissions
- the function's Supabase entry point
- the Settings control and a push delivered to the real service worker in Chromium

## v1.15

**40 achievements** (up from 10)
- Grouped into Feeds, Nursing, Bottle and pump, Diapers, Vitamin D, Baths, and Weight and milestones, each with an earned count
- Higher tiers of the originals, marked ★★ or ★★★:
  - Fortnight Strong (14 days) and Month of Feeds (30)
  - Clockwork (8+ feeds on 20 days)
  - Nursing Natural (50 sessions) and Switch Master (25 alternating starts)
  - Bottle Boss (50) and Bottle Legend (150)
  - Bigger Day (400 mL) and Biggest Day (500 mL)
  - Pump Pro (50)
  - Diaper Dynamo (14 days), Diaper Legend (30), and Diaper Master (14 in a row)
  - Vitamin D Devotee (14 in a row) and Sunshine Superstar (30)
  - Feed Machine (500 feeds) and One Thousand Feeds
  - Bath Buddy (10 baths), Perfect Week, and One Month Old
- New kinds:
  - Century Club (100 feeds)
  - Night Owl (10 feeds between midnight and 5am)
  - Perfect Day (8+ feeds, both diaper goals, and Vitamin D when due)
  - Note Taker (day notes on 5 days)
  - Liquid Gold (5 liters pumped)
  - Splish Splash (first bath)
  - Weigh In (first weight) and Weighted Wonder (5 weighted feeds)
  - Back to Birth Weight
  - Two Weeks Old
- Earned dates are worked out from the log, so badges you already qualified for show as earned right away

**Themes window**
- The profile menu has one **🎨 Themes** item, showing the current theme. It opens a window with Auto, Light, and Dark, and the four fun themes with a short description each.

**Doctor report fixes** (checked against the log with separate code)
- **Pumped** now averages over the days you pumped, and says how many ("365 mL/day on 8 days with pumping"). Before, days without pumping counted as zero, which made it look lower.
- **Vitamin D** only counts days on or after the Vitamin D start date. Before, drops logged earlier could show "10 of 9 days".
- **Days before the birth date** are left out of the table when the 14-day range reaches back that far
- **Nursing** says how many nursing feeds were timed, when some weren't, since untimed feeds count as 0 minutes
- The daily rows (feeds, nursing minutes, bottle, pump, wet, stool, Vitamin D, baths, longest gap) were already right

**Dashboard fixes**
- Pumped per day uses completed days, like the other averages
- Vitamin D counts only days since the start date

## v1.14

**Dashboard filters**
- A row of chips under Print: **All**, **🤱 Feeds**, **🍼 Bottle & pump**, **💧 Diapers**, **☀️ Vitamin D**, **⚖️ Weight**, **🛁 Baths**
- Each shows only that topic's cards, charts, and insights:
  - **Feeds:** feeds per day, between feeds, side starts, the day's feeds chart, longest stretch, side balance, and feeding rhythm
  - **Bottle & pump:** bottle and pumped per day, the day's feeds chart, and daily volume
  - **Diapers:** wet and stool goals, and daily diapers
  - **Vitamin D:** the Vitamin D tile and strip, and feeding rhythm (which marks the drops)
  - **Weight:** the weight chart and stats
  - **Baths:** the baths tile and insight
- Remembered per phone, and kept when you switch between 7 and 14 days
- **Print** prints what's showing, so you can print just the weight chart, for example. The doctor report is unchanged.
- On a phone the chips scroll sideways

## v1.13

**Two more seasonal themes**, in Appearance under **Fun themes**, next to Halloween:
- **🦃 Thanksgiving mode:** warm cream and deep brown with a maple-orange accent and olive green for goals met. Faint falling maple leaves and acorns in the background, an orange line under the header, and an acorn cap on the logo.
- **🎄 Christmas mode:** snowy white with Christmas red and evergreen. Faint snowflakes in the background, a red, white, and green candy-cane stripe under the header, a Santa hat on the logo, and an evergreen splash screen.
- Each greets you when you switch to it ("Merry Christmas!"). Like every theme, they're saved per phone and don't sync. Night shift and Calm keep their own colors.

**A shorter profile menu**
- **💾 Data management** gathers Export data, Import data, Print this tab, Erase all data, and Sign out and remove from this phone into one screen, with a line explaining each
- **Fun themes** (Dalmatian, Halloween, Thanksgiving, Christmas) sit in a compact two-by-two grid under Auto, Light, and Dark
- The menu is about a third shorter

**☕ Buy me a coffee**
- An optional donation button in the profile menu and a card in About
- Set it with the `CRADLE_DONATE_URL` environment variable on Netlify (or in `.env`). Without it, the button is hidden. Only `https://` links are accepted.

## v1.12

**New tagline**
- **Family baby log** on the splash and sign-in screens; **Baby log** everywhere else:
  - the header (or *Juniper's baby log* once the baby's name is set) and the profile menu
  - the About dialog, the browser tab, and the installed app's name and description
  - the printed day sheet, the doctor report footer, the family welcome, and the share invite
- Cradle is still built around triple feeding, and the docs now say it works just as well for nursing or bottle feeding alone

**🎃 Halloween mode**
- New in the profile menu under Appearance, below Dalmatian mode, marked *Seasonal*
- A dark night theme: deep purple-black with faint bats and stars, pumpkin-orange buttons with dark text, slime-green for goals met, and an orange line under the header
- The logo becomes a jack-o'-lantern, in the header and on the splash and sign-in screens
- Like the other themes, it's saved per phone and doesn't sync. Night shift and Calm keep their own colors.

## v1.11

**Editing together**
- Entries now merge **field by field**. If one person adds the bottle while another types a note on the same feed, both are kept, instead of one phone's copy overwriting the other.
  - each round now pulls (and merges) before it pushes
  - if both change the same box, the later one wins and every phone agrees
  - a delete wins over a simultaneous edit
- **Fixed:** an edit made while a sync was in progress could be marked as synced without being uploaded, so other phones never got it.
- **While you're typing,** other people's changes appear everywhere on the Log except the box you're in. New rows from other phones appear in order.
- When someone else's change arrives, a note says who made it ("Sam updated a feed at 2:40pm") and the row flashes.

**Weights**
- The Weights screen lists every weight first, newest at the top
- **Edit** a weight (date, time, weight, where, note), or delete it
- Weighted-feed weights have **Open feed**, and the birth weight has **Settings**
- **See all** on the Dashboard's weight card opens the list. **+ Add weight** goes straight to the form.

No database changes.

## v1.10

**Left and right split**
- When both sides are on, a **Left ↔ Right** slider appears on the feed. Slide it toward the side that got more time and it divides the feed's minutes: 20 minutes at 75% left is 15 left and 5 right.
- Steps of 5%; the middle is an even split. It shows percentages until minutes are entered, then minutes per side, and follows the ▶ timer.
- Also in **Night shift** when both L and R are on.
- Time on each side shows up in:
  - the Dashboard's side balance, plus an insight when one side gets noticeably more
  - the chart explorer's feed table and details
  - the printed day sheet (`20 (L15/R5)`)
  - the doctor report (`left 60%, right 40%`)
- Stored as `split` (percent on the left) on the feed, so export, text-message codes, import, and family sync carry it. Older both-sides feeds count as 50/50. No database changes.

## v1.9

**Security**
- **Security headers** on the hosted site, generated by `build_pwa.py` into `pwa/_headers`:
  - a Content-Security-Policy that only runs Cradle's own script (by hash) and only connects to your Supabase project
  - plus no framing, `nosniff`, `no-referrer`, a Permissions-Policy, and HSTS
- **Sign out and remove from this phone** clears the log, settings, and game scores from a shared or lost phone. It syncs first and warns about anything that hasn't reached your account.
- **Erase all data** is now for the family owner only. Members see *Owner only*, and can still delete single entries.

**Fixes**
- The profile menu scrolls when it's taller than the screen

## v1.8

**Fun center** (rerun `supabase/2-family.sql`)
- New in the profile menu, under Learning center: **🍼 Bottle Catch**
  - a two-minute, one-thumb game: catch bottles, dodge safety pins, and grab the pacifier for slow-mo
  - golden bottles are worth +50, and catching in a row builds up to ×4
  - 3 hearts, and it speeds up as the clock runs down
  - pauses itself when you switch away or the feed alarm rings; sound starts off, with Buzz and Sound toggles
- Arcade-style high scores with 3 initials:
  - three boards: **Everyone**, **Our family**, **My best**
  - initials are picked once and changeable anytime
  - offline rounds post later
- Database: `cradle_players` and `cradle_scores`, plus `cradle_scores_board`, `cradle_set_initials`, and `cradle_submit_score`
  - the server refuses impossible scores, posting too often, and a short list of rude initials
  - only initials and scores are ever shown to others
- Admin queries 17 to 20 for scores

## v1.7

**Learning center**
- New in the profile menu: five original high-contrast cards (Bullseye, Checkerboard, Zigzag, Spiral, Smile)
- Full-screen viewer:
  - swipe or tap the sides to change cards
  - **Invert** swaps black and white
  - **Auto** changes cards every 10 seconds
  - the screen stays on

**Alarm**
- **⏰ Set alarm** (was Phone alarm) opens a clear card with the time to set and the steps, on Android and iPhone

**Docs**
- New [Deployment and architecture](docs/deployment.md): GitHub → Netlify → Supabase, the schema, settings, rollbacks, releasing, and the design decisions behind Cradle
- New [`supabase/admin-queries.sql`](supabase/admin-queries.sql): confirm accounts, find families and people, new share key, transfer ownership, clear lockouts, read a family's log, check storage

## v1.6

**Baths**
- **🛁 Bath** on the Log, next to Diaper only, and on Night shift's start screen
- Each bath has a time, **Sponge** or **Tub** (Cradle remembers the last kind), and a note
- Baths never count as feeds: feed totals, gaps, streaks, and the next-feed time are unchanged
- Baths show up everywhere:
  - a Bath tile on the Log
  - a Baths tile and insight on the Dashboard
  - tags and a column in History
  - the chart explorer
  - the printed day sheet
  - the doctor report
- Export, text-message codes, import (Replace and Merge), and family sync all carry baths. No database changes.

## v1.5

**Accounts and families**
- Family sharing: everyone has their own login, and a family shares one log
- Create an account from the sign-in screen, with a share key (like `K7QM-4XPD`) to join a family
- Family screen: share key, **Share** invite text, **New key**, add by email, remove people, leave
- Welcome screen for new family members
- Change password
- A share key entered at sign-up is remembered if Supabase still requires email confirmation
- The sign-in screen offers a backup when the phone already has a log
- When a different account signs in on a phone, the phone starts fresh so logs never mix

**Layout and alarms**
- Tabs reordered: Log, Night shift, Dashboard, History
- Calm is now the 🌙 button at the top right
- **⏰ Phone alarm** shows the time to set (Android blocks web apps from creating Clock alarms)

**Build**
- The Supabase address and publishable key come from environment variables (`CRADLE_SUPABASE_URL`, `CRADLE_SUPABASE_KEY`) or a git-ignored `.env`, never the repo
- The build refuses a secret key

**Database** (rerun `supabase/2-family.sql`)
- Families, members, invites, and share keys
- 10 wrong share keys in an hour locks joining for that hour
- Invites can only be claimed by accounts that existed when invited
- Deleting an account no longer deletes the family entries it last edited
- Both scripts are safe to rerun in any order

## v1.4
- Splash screen and sign-in
- Shared log that syncs between phones through your own Supabase project
- Works offline and catches up when back online
- Installable app (manifest, icons, offline service worker) via `build_pwa.py`
- Sign out from the profile menu

## v1.3
- Guide moved to the profile menu
- Next feed due time with an in-app alarm, snooze, and dismiss
- Weighted feeds with before and after weights
- Weight tracking with a chart against birth weight
- Doctor report from the Dashboard
- Night shift with big night controls and Warm, Moonlight, and Red colors
- Calm screen with spa music, ocean, rain, and white noise
- Minutes on each feed with a nursing timer

## v1.2
- Send updates by text message as a short `CRADLE1:` code, and paste it into Import
- Enlarge any dashboard chart to explore days and feeds
- Today is shown as in progress on the dashboard
- Vitamin D start date, so earlier days aren't counted as missed
- Achievements with progress and badges
- Optional built-in starter log for personal copies
- Erase all data from the profile menu
- Diaper-only rows (🧷) that don't count as feeds
- Birth date counts as Day 0
- In-app confirm dialogs, plus help when printing or downloading is blocked
- Profile menu with Auto, Light, and Dark themes, and Dalmatian mode (experimental)
- Merge or replace when importing
- Print button on every tab
- Dashboard insights, Vitamin D tracking, side balance, and longest stretch
- History table view

## v1.1
- Vitamin D on each feed
- Diaper goals follow the baby's day of life

## v1.0
- Feed log, pump timer, dashboard, history, and guide
