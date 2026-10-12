# Changelog

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
