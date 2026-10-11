# Notifications

Cradle can send a notification to each phone that asks for one when the next feed is due, even when Cradle is closed. Each phone chooses for itself: **when a feed is due**, **15 minutes before**, or **30 minutes before**.

This is optional. Without it, Cradle still rings its in-app alarm while it's open on screen.

**Contents:** [Using notifications](#using-notifications) · [Setting them up](#setting-them-up-once-for-your-cradle) · [How it works](#how-it-works) · [Privacy and security](#privacy-and-security) · [Troubleshooting](#troubleshooting)

---

## Using notifications

On each phone: profile menu, then **Settings**, then **📣 Notify this phone, even when Cradle is closed**. Choose when, then allow notifications when the phone asks.

- **Android:** works in Chrome, and in the installed app.
- **iPhone and iPad:** add Cradle to the Home Screen first (Share, then **Add to Home Screen**), then open it from there. Needs iOS 16.4 or later.
- **Each phone is separate.** Turn it on on every phone that should be told. Turning it off on one phone doesn't affect the others.

**What you'll see:** "🍼 Feed due in 15 min · Juniper" with "Due at 4:55pm. Last feed was at 1:55pm." A newer notification replaces the older one. Tapping it opens Cradle.

**When it's sent:** the next feed is the family's last feed plus the **Feed every** time in Settings, the same time the Log shows. Logging a feed moves it. Baths and diaper-only rows don't count as feeds. A feed is announced once per phone, and nothing is sent once a feed is more than 2 hours overdue.

**Needs a connection.** The server only knows about feeds that have synced, and the phone needs a connection to receive the notification.

---

## Setting them up (once for your Cradle)

You need your Supabase project. It takes about 10 minutes, and nothing is installed on your computer.

### 1. Run the database script

In Supabase, open **SQL Editor**, then **New query**. Paste all of [`supabase/3-notifications.sql`](../supabase/3-notifications.sql) and press **Run**. It's safe to run again later.

### 2. Create the cradle-notify function

1. In Supabase, open **Edge Functions**, then **Deploy a new function**, then **Via Editor**.
2. Name it exactly `cradle-notify`: **all lowercase, with a hyphen**. The name becomes part of the function's web address, and that's case-sensitive, so `Cradle-notify` or `cradle_notify` won't be found by the schedule (you'd see `"Requested function was not found"`).
3. Delete the starter code, paste all of [`supabase/functions/cradle-notify/index.ts`](../supabase/functions/cradle-notify/index.ts), and choose **Deploy function**.
4. Open the function's settings and turn **off** JWT verification (shown as **Verify JWT** or **Enforce JWT verification**).
   - This lets the schedule in step 3 start it.
   - The function only sends notifications that are due, once each, so starting it extra times does nothing.
   - With the Supabase CLI instead: `supabase functions deploy cradle-notify --no-verify-jwt`.

The function uses your project's own service key, which Supabase gives every function automatically. **You don't copy any key into it.** The first time it runs, it creates the notification keys and saves them in your database.

### 3. Run it every minute

1. Open [`supabase/4-notify-schedule.sql`](../supabase/4-notify-schedule.sql).
2. Replace `YOUR-PROJECT-REF` with your project's ref (the part before `.supabase.co` in your Project URL).
3. Paste it into **SQL Editor** and press **Run**.

It turns on Supabase's `pg_cron` and `pg_net` extensions and schedules the function every minute. You can also schedule it from **Integrations**, then **Cron**, as a job named `cradle-notify` that calls the `cradle-notify` Edge Function every minute (`* * * * *`). Use that job name so the unschedule command and admin queries find it.

### 4. Check it

- **Edge Functions**, then **cradle-notify**, then **Logs** shows a run every minute.
- Opening `https://YOUR-PROJECT-REF.supabase.co/functions/v1/cradle-notify` in a browser shows something like `{"sent":0,"failed":0,"keys_ready":true}`.
- In Cradle, **Settings** now offers the **Notify this phone** choices. Before the function's first run, it says *Almost ready*.

To stop notifications for everyone, unschedule the job (`select cron.unschedule('cradle-notify');`). To remove them completely, also delete the function.

**Cost:** a run every minute is about 44,000 function calls a month, well inside Supabase's free plan.

---

## How it works

```
Phone (Settings)                Supabase                              Push service
───────────────                 ────────                              ────────────
Turn on ──────────────────────▶ cradle_push_subscribe()
  (browser push address,         saves the phone in cradle_push_subs
   keys, time zone, how early)

                                 Every minute: pg_cron ──▶ cradle-notify function
                                   cradle_push_due():
                                     last feed + Feed every = due time
                                     due now (or soon) and not yet told?
                                   encrypt and sign each message ──────▶ Google, Apple,
                                   cradle_push_result()                  or Mozilla
                                                                            │
Notification on the lock screen ◀───────────────────────────────────────────┘
  (shown by Cradle's service worker)
```

- **[`supabase/3-notifications.sql`](../supabase/3-notifications.sql)** adds two tables and the functions that use them:
  - `cradle_push_subs`: one row per phone
  - `cradle_push_keys`: the notification keys
  - The due time is worked out in the database, in each phone's own time zone. A phone is only told about the family it currently belongs to.
- **[`supabase/functions/cradle-notify/index.ts`](../supabase/functions/cradle-notify/index.ts)** uses standard Web Push:
  - VAPID signing (RFC 8292) and aes128gcm encryption (RFC 8291), with the built-in Web Crypto API and nothing to install
  - Cradle's tests check its encryption byte for byte against the example in RFC 8291
- **The service worker** (written by `build_pwa.py` into `pwa/sw.js`) shows the notification and opens Cradle when it's tapped.
- **Cleanup:** a phone whose push address stops working (the push service answers 404 or 410) is removed automatically. One that fails 20 times in a row is removed too.

---

## Privacy and security

- **What's saved for a phone:** its browser's push address, the encryption keys for it, its time zone, and how early to be told. Nothing else about the phone.
- **What travels:** the notification text is encrypted for that one phone before it leaves Supabase. Google, Apple, or Mozilla deliver it but can't read it.
- **Who can read the tables:** the app has no direct access to the push tables. Signed-in users can only add, change, or remove their own phone through the functions. Only the cradle-notify function (the service role) can read the private notification key or the list of phones.
- **What a notification shows:** the baby's name (if set in Settings) and the due and last-feed times. Anyone who can see the phone's lock screen can see that, so turn it off on phones where that's not OK.

---

## Troubleshooting

**Settings says "Not set up for this Cradle yet"**
Step 1 hasn't been run on this Supabase project.

**Settings says "Almost ready"**
The function hasn't run yet: check steps 2 and 3. Opening the function's address (step 4) runs it once. If that address says *Requested function was not found*, the function's name isn't exactly `cradle-notify` in lowercase.

**The choice is greyed out**
Settings explains why:
- the browser can't show notifications
- Cradle was opened as a file instead of from its web address
- on iPhone, Cradle needs to be on the Home Screen
- notifications are blocked for Cradle in the phone's settings
- you're signed out or offline

**No notification arrived**
- Check the function's **Logs** in Supabase for a run every minute, and look at `sent` and `failed`.
- Make sure the feed has synced (the ☁︎ icon), and that **Feed every** in Settings is right.
- On Android, check that Chrome (or the Cradle app) is allowed to send notifications and isn't battery-restricted.
- Choose **Off**, then turn it on again, to save this phone afresh.

**Too many or too few**
Each phone picks its own timing in Settings. A feed is announced once per phone.

For admins: [`supabase/admin-queries.sql`](../supabase/admin-queries.sql) has queries to list and remove phones that get notifications.
