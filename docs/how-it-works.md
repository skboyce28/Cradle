# How it works

For anyone reading, changing, or reviewing the code. For how it's deployed and why it's built this way, see [Deployment and architecture](deployment.md).

## The app

- **One file.** `cradle.html` holds all the HTML, CSS, and JavaScript. There's no framework, no build step for the code itself, and no external libraries, fonts, or analytics. Charts are inline SVG. The only network requests go to your own Supabase project.
- **State.** The whole log is one object kept in `localStorage` under `cradle-feeding-v1`:
  - `days`: keyed by date (`YYYY-MM-DD`); each day has `feeds`, `notes`, and a Vitamin D flag
  - `weights`, `settings`, plus UI preferences
  - `migrate()` upgrades older saved shapes when the app loads
- **Sync state.** Sign-in and sync bookkeeping live separately under `cradle-cloud-v1`: session tokens, the family id, the last sync time, and a fingerprint of each item as last synced.
- **Day of life.** The birth date in Settings is **Day 0**. Diaper goals are computed from it.
- **Feeds vs. other rows.** A 🧷 diaper-only row (no breast, bottle, or pump) and a 🛁 bath row (`bath: "sponge"` or `"tub"`, plus `time` and `note`) live in the same `feeds` list but never count as feeds in stats, streaks, gaps, or the next-feed time. `isFeed()` checks for `bath` first.

### The installable build

`build_pwa.py` turns `cradle.html` into the hosted app in `pwa/`:

- Removes the `baseData` block, an optional starter log for personal copies, so personal data can't reach a public site
- Bakes in `CRADLE_SUPABASE_URL` and `CRADLE_SUPABASE_KEY` from the environment or a git-ignored `.env`, and refuses secret keys
- Writes `manifest.webmanifest` and copies the icons
- Writes `sw.js`, a service worker whose cache name is a hash of the page. Page loads try the network first (so updates arrive) and fall back to the cached copy offline.

## Sync

The log is split into small **items**, each synced on its own:

| Item id | Holds |
|---|---|
| `feed:<id>` | One row from a day's log (a feed, a diaper-only row, or a bath), plus its date |
| `day:<YYYY-MM-DD>` | That day's notes and Vitamin D flag |
| `weight:<id>` | One weight |
| `settings` | Shared settings: goals, baby name, birth date and weight, Vitamin D start, feed interval |

Theme, weight units, the alarm switch, and layout preferences stay per phone.

### Each round

A round runs when the app opens, about a second after any save, every 15 seconds while the app is on screen, and when the phone comes back online:

1. **Bootstrap** (first round after sign-in): ask the database which family this account belongs to. It creates a family if there isn't one, and accepts any pending invite.
2. **Push:** compare every local item with its fingerprint from the last sync, and upload only what changed. A deletion is uploaded as a tombstone (`deleted = true`), so other phones remove it too.
3. **Pull:** download items changed since the last pull (`updated_at >= last`) and apply them.

**Conflicts.**
- **A phone's first sync with a family:** the server's copy wins for items both sides have, then items only on the phone are uploaded. That's how a phone's existing log merges into a family.
- **After that:** each item is last-write-wins. An edit uploads on the next round and becomes the newest version for everyone. Two people editing the *same feed row* within seconds of each other is the only case where one edit can overwrite the other.

**Offline.** Saves always go to the phone first. Failed rounds just retry later; nothing is lost while offline.

**Tokens.** Sign-in uses Supabase Auth's REST API directly. The access token is refreshed before it expires; if refreshing fails, the app asks you to sign in again.

## Database

Two scripts in `supabase/` build the schema. Both are idempotent and safe to rerun in any order.

### Tables

| Table | Purpose |
|---|---|
| `cradle_items` | Every synced item. Primary key `(household_id, id)`. Columns: `kind`, `data` (JSON), `deleted`, `updated_at` (set by the server), and `owner`, the account that last saved it. |
| `cradle_households` | Families: `name` and `join_code` (the share key) |
| `cradle_members` | Who belongs to which family, with role `owner` or `member` |
| `cradle_invites` | Pending "add by email" invites |
| `cradle_join_tries` | Wrong share-key attempts, for rate limiting |

A trigger (`cradle_touch`) stamps `updated_at` with the server's clock and records `owner` on every write, so phones with wrong clocks can't confuse sync. Deleting an account clears `owner` on its entries but **never deletes entries**.

### Rules (row-level security)

Every table has row-level security on.

- **`cradle_items`:** you can read and write a row only if its `household_id` is one of your families, via `cradle_my_households()`. You also can't write a row into a family you're not in.
- **Families, members, invites:** you can only *read* rows for your own families. You can't write them directly at all.
- **`cradle_join_tries`:** no access from the app.

All changes to families go through these functions, which check permissions themselves and are callable only by signed-in users:

| Function | Who | Does |
|---|---|---|
| `cradle_bootstrap()` | anyone signed in | Accepts invites for your email, returns your family (creating one if needed) |
| `cradle_family_info(h)` | members | Name, share key, people, pending invites |
| `cradle_join(code)` | anyone signed in | Joins the family with that key. Wrong keys are counted; 10 in an hour locks joining for that hour. |
| `cradle_invite(h, email)` / `cradle_uninvite` | members | Adds or cancels an invite for an **existing** account |
| `cradle_rename(h, name)` | members | Renames the family |
| `cradle_new_code(h)` | owner | New share key; the old one stops working |
| `cradle_remove_member(h, user)` | owner | Removes someone |
| `cradle_leave(h)` | members | Leaves the family |

Share keys are 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as `XXXX-XXXX`: about 850 billion combinations.

An invite can only be claimed by an account that **existed when the invite was made**. Because sign-ups don't verify email, this stops a stranger from registering someone else's address after you invite it.

## Security

**What protects the data:**
- **The database, not the app,** decides who sees what. A modified copy of Cradle with the same publishable key still can't read or change another family's rows.
- **The publishable key** only identifies your project. It's built into the hosted page, so anyone who opens your site can see it; it's kept out of the repo (in `.env` or Netlify's environment variables) so project details stay out of the code history.
- **The secret key** (`sb_secret_…` or `service_role`) bypasses every rule. It must never be in this repo, the app, or a chat, and Cradle never needs it.

**What to know:**
- **Email isn't verified** when confirmation is off, so an email address on an account proves nothing. Share keys, not emails, decide who joins a family.
- **Username accounts** (`name@cradle.cfg`) can't receive password-reset emails.
- **The project owner** can see all data in the Supabase dashboard.
- **On a phone**, the log is stored unencrypted in the browser, like any website's saved data. Anyone who can unlock the phone and open Cradle can see it.
- **The hosted build removes the starter-log block**, and the build fails if it can't. Personal starter data belongs only in a local copy, never in a commit.

**Review status:** the database scripts and the app were tested in a simulated setup:
- a real Postgres 16 database running these scripts
- stand-ins for Supabase's sign-in service
- an automated browser playing several phones

That testing covered:
- families staying separate
- the owner-only actions
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
- **Database changes** go in `supabase/2-family.sql`, written so they're safe to rerun (`if not exists`, `create or replace`, `drop … if exists`).
- **Build:** `python3 build_pwa.py`, then serve `pwa/` over http(s) to test install and offline. For example: `python3 -m http.server -d pwa 8080`.
