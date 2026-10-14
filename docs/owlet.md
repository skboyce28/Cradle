# Owlet Dream Sock

Cradle can log sleep from an Owlet Dream Sock automatically. When the sock reports the baby asleep, a sleep row appears on the Log (marked **from Owlet**) on every family phone, and its wake time and length are filled in when the baby wakes.

This is optional, and it needs [sleep tracking](using-cradle.md#sleep) turned on. Without it, you can still log sleep by hand with **😴 Asleep** and **☀️ Woke up**.

> **Unofficial.** Owlet doesn't offer a public way for other apps to connect. Cradle uses the same calls Owlet's own app makes, as documented by the open-source [pyowletapi](https://github.com/ryanbdclark/pyowletapi) library (which the Home Assistant Owlet integration uses). If Owlet changes its app, this can stop working until Cradle is updated. It reads only your own sock, with your own Owlet account.
>
> **Not a monitor.** Cradle only logs sleep. Keep using Owlet's app and base station for notifications and alerts.

**Contents:** [Using it](#using-it) · [How sleep is detected](#how-sleep-is-detected) · [Setting it up](#setting-it-up-once-for-your-cradle) · [Privacy and security](#privacy-and-security) · [Troubleshooting](#troubleshooting)

---

## Using it

**First, your family must require two-step sign-in.** Cradle keeps a sign-in to your Owlet account, so it only does that for families where everyone signs in with a code. The family owner turns it on in **Family**, under Two-step sign-in, after setting it up for themselves (see [Two-step sign-in](accounts-and-families.md#two-step-sign-in)). Without it, the Dream Sock section explains this and, for the owner, has a **Require it in Family** button.

1. In **Settings**, under **What you track**, turn on **😴 Sleep**. Cradle asks **Do you have an Owlet Dream Sock?** Tap **Yes, set it up**.
2. The **🦉 Owlet Dream Sock** form appears right away. Enter the email and password you use in Owlet's app, and pick the region your Owlet account is in (**Europe**, or **United States and most countries**).
3. Tap **Connect**. If the account has more than one sock, choose the one for this baby. Connecting saves Sleep as on for the family; there's no need to tap Save.

**Said No, or set it up later?** With Sleep on, **What you track** has a **🦉 Dream Sock** box next to 😴 Sleep, greyed out until you tick it. Tick it any time to show the form. Cradle asks only once per family; the box is how you change your mind. Unticking it while a sock is connected asks whether to disconnect.

One person connects it, and it works for the whole family. Settings then shows the sock, the account (masked, like `j•••@example.com`), who connected it, whether the baby is asleep or awake, the sock's battery, and when it was last checked.

The Log's asleep or awake line also shows the sock's status, like **🦉 Asleep, checked just now**.

- **Disconnect** (in Settings) stops the checks and deletes Cradle's Owlet sign-in. Sleep already logged stays.
- **Turning Sleep off** in Settings stops Owlet from adding sleep, but the connection stays.
- **Owlet or by hand?** Rows from the sock say **from Owlet**. The Log's Sleep tile says how much of the day came from Owlet; on the Dashboard, the Sleep tile gives the split (like *🦉 80% from Owlet, 20% by hand*), the Daily sleep chart has a thin teal line beside each day's bar for the Owlet part, and tapping a bar shows both.
- **Rows from Owlet are ordinary sleep rows.** Anyone can fix a time, add a note, or delete one.
- **Hand-logged and Owlet sleep are merged** in every total (the Log's Sleep tile, the Dashboard, History, and the doctor report). Where a sleep you tapped overlaps one from the sock, the time is counted once.

## How sleep is detected

Cradle checks the sock about once a minute and reads its sleep state: awake, light sleep, or deep sleep (both sleeps count as asleep).

| What the sock reports | What Cradle does |
|---|---|
| Asleep for **3 minutes** | Starts a sleep, timed from when it was first seen asleep |
| Awake for **5 minutes** | Ends the sleep, timed from when it was first seen awake |
| On the charger, or off the foot, for **5 minutes** | Ends the sleep |
| No new reading for **10 minutes** (sock out of range, base station off) | Counts as off, so the sleep ends 5 minutes later |
| A state the sock doesn't name, for **10 minutes** | Ends the sleep |

The holds stop a brief stir from splitting one sleep into two. A sleep shorter than 3 minutes isn't logged.

- **Someone already tapped 😴 Asleep?** Cradle keeps that row and fills in its wake time, rather than adding a second one.
- **Someone already tapped ☀️ Woke up?** Their wake time stays.
- **Times** use the time zone of the phone that connected the sock.

Owlet's older Smart Sock 2 doesn't report sleep, so Settings says *This sock doesn't report sleep*.

---

## Setting it up (once for your Cradle)

Whoever runs the Supabase project does this once. It takes about 10 minutes, and it works like [notifications](notifications.md).

### 1. Run the database script

In Supabase, open **SQL Editor**, then **New query**. Paste all of [`supabase/7-owlet.sql`](../supabase/7-owlet.sql) and press **Run**. It's safe to run again.

### 2. Make the encryption key

Cradle keeps each family's Owlet sign-in encrypted with a key that only the Edge Function has. Make one: 32 random bytes, written in base64.

- **On a Mac or Linux terminal:** `openssl rand -base64 32`
- **Or in Supabase's SQL Editor:** `select encode(extensions.gen_random_bytes(32), 'base64');` (then delete that query from the editor's history)

It looks like `q3Jx…0Y=` (44 characters). Don't commit it or paste it anywhere else.

In Supabase, open **Edge Functions**, then **Secrets**, and add a secret named `CRADLE_OWLET_KEY` with that value.

Keep a copy somewhere safe, like a password manager. If the key changes or is lost, every connected sock has to be connected again.

### 3. Create the cradle-owlet function

1. In Supabase, open **Edge Functions**, then **Deploy a new function**, then **Via Editor**.
2. Name it `cradle-owlet` (all lowercase, with a hyphen). The app calls it by that name.
3. Delete the starter code, paste all of [`supabase/functions/cradle-owlet/index.ts`](../supabase/functions/cradle-owlet/index.ts), and choose **Deploy function**.
4. Open the function's settings and turn **off** JWT verification (**Verify JWT**). This lets the schedule start it. Connecting still requires being signed in to Cradle: the function passes the person's own sign-in to the database, which checks it.
   - With the Supabase CLI instead: `supabase functions deploy cradle-owlet --no-verify-jwt`.

The function uses your project's own service key, which Supabase gives every function automatically.

### 4. Check every minute

1. Open [`supabase/8-owlet-schedule.sql`](../supabase/8-owlet-schedule.sql).
2. Replace `YOUR-PROJECT-REF` with your project's ref (the part before `.supabase.co` in your Project URL). If your function's address has capitals, copy it exactly from the function's page.
3. Paste it into **SQL Editor** and press **Run**.

### 5. Check it

Wait two minutes, then run:

```sql
select status_code, content, created from net._http_response order by created desc limit 5;
```

- **200** with `{"checked":0,"ok":0,"errors":0}`: working, with no sock connected yet. After someone connects one, `checked` is 1 or more. The answer is only counts, never which socks are asleep, since anyone can call the function's address.
- The [status page](deployment.md#status-page) shows an **Owlet sleep** row: how many socks are connected, the last reading, and the every-minute job's runs. It warns if the schedule is missing or a sock hasn't been read in 10 minutes, and so does the outside check every 30 minutes.
- **500** with `CRADLE_OWLET_KEY must be 32 random bytes in base64`: the secret from step 2 is missing or wrong.
- **404**: the schedule's address doesn't match the function's. Compare them letter by letter.
- **401**: JWT verification is still on (step 3.4).

The status page lists `7-owlet.sql` under Schema once step 1 has run.

**Cost:** a run every minute is about 44,000 function calls a month, well inside Supabase's free plan. Each connected sock adds two calls to Owlet a minute (Owlet's app makes them more often).

To stop it for everyone: `select cron.unschedule('cradle-owlet');`. To remove it completely, also delete the function and the `CRADLE_OWLET_KEY` secret, and run `drop table public.cradle_owlet, public.cradle_owlet_tries;`.

---

## Privacy and security

- **Your Owlet password is used once and never stored.** It goes from your phone to the `cradle-owlet` function over HTTPS, which hands it to Owlet's sign-in and keeps only the sign-in token Owlet returns. It isn't saved in the database, in the function's logs, or on your phone.
- **The token is encrypted.** It's stored with AES-GCM, using the `CRADLE_OWLET_KEY` that exists only in the Edge Function's secrets, never in the database. Each token is tied to its family, so a token copied into another family's row can't be decrypted.
- **The app can't read the stored connection.** Phones see only the sock's name, the masked account, the state (asleep, awake, charging, off), battery, and when it was checked, through `cradle_owlet_status()`, and only for their own family.
- **Heart rate and oxygen are never stored or shown.** Owlet's answer includes them, and the function discards them right away. Only the sleep state, charging, and battery are kept.
- **Who could use the token:** someone with both your database and the Edge Function's secrets, which in practice means whoever runs this Supabase project. If you run a Cradle for friends, tell them.
- **To cut Cradle off from Owlet's side**, change your Owlet password. That should sign out every app using the old sign-in, including Cradle, which then asks to connect again.
- **Two-step sign-in is required.** A sock can only be connected in a family that requires [two-step sign-in](accounts-and-families.md#two-step-sign-in), by someone who has entered their code. The database enforces it, not just the app. A sign-in that hasn't finished the code step can't see the sock's state either, just as it can't see the log.
- **If the owner stops requiring it,** checks pause: nothing more is read from Owlet and the Log says *Owlet paused*. The encrypted Owlet sign-in is kept, so turning the requirement back on resumes without the Owlet password. To remove it instead, tap **Disconnect**.
- **Limits:** 10 connection tries an hour per account, and only family members can connect or disconnect.

---

## Troubleshooting

**"That Owlet email or password isn't right."** Use the email and password for Owlet's app. If you sign in to Owlet with Google or Apple, set a password in Owlet's app first. Check the region: European accounts need **Europe**.

**Netlify's build fails with "Exposed secrets detected".** Netlify's smart secret scanning flags the Owlet app identifiers in `supabase/functions/cradle-owlet/index.ts`. They're public (built into Owlet's app), and `netlify.toml` allows exactly those values and that file, with scanning left on for everything else. If Owlet's identifiers ever change, update both the function and `netlify.toml`.

**"A Dream Sock needs two-step sign-in for everyone in your family."** The family owner needs to set up two-step sign-in for themselves (profile menu, **Sign-in and security**), then tick **Require it for everyone in this family** in **Family**. The **Require it in Family** button goes straight there.

**"Owlet paused".** The family stopped requiring two-step sign-in. Turn it back on in Family, and checks resume within a minute.

**"This Cradle isn't set up for Owlet yet."** Steps 1 to 3 above haven't been done, or the function has a different name than `cradle-owlet`.

**"Owlet signed Cradle out. Connect the sock again."** Owlet no longer accepts the saved sign-in, usually after a password change. Enter the email and password again in Settings.

**The sock shows Asleep or Awake, but nothing is logged.** Check that **😴 Sleep** is on in Settings. A sleep is only logged after 3 minutes asleep.

**Checks stopped (checked 30 min ago).** Run the query in step 5. If the function answers 200 but the time doesn't move, check the base station is on and the sock is on the foot. If Owlet changed its app, the function's error shows in Settings, under the sock.

**Two sleeps instead of one.** The baby was awake for 5 minutes or more in between. Delete one row and fix the other's times, if you like.

**Wrong times.** Sleep times use the time zone of the phone that connected the sock. Connect it again from a phone in the right time zone.
