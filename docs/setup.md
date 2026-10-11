# Setup

This gets Cradle running on your own free accounts: **Supabase** holds the shared log and the sign-ins, and **Netlify** hosts the app. You do this once. After that, people just open your link and create an account.

You'll need: a computer for the first setup, about 15 minutes, and Python 3 if you build locally (Netlify can build it for you instead).

> Supabase and Netlify change their dashboards from time to time. If a menu name below doesn't match exactly, look for the closest one.

---

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a **New project** on the free plan. Any name works (for example, `cradle`). Pick a region near you and save the database password somewhere safe. Cradle never needs it.
2. Wait a minute or two for the project to finish setting up.

## 2. Run the database scripts

In your project, open **SQL Editor**, then **New query**. Run each script by pasting the **whole file** and pressing **Run**:

1. [`supabase/1-setup.sql`](../supabase/1-setup.sql): the table that holds the log.
2. [`supabase/2-family.sql`](../supabase/2-family.sql): families, accounts, share keys, and the rules for who can see what.

Each should finish with *Success. No rows returned*. If Supabase warns that a query is destructive, that's expected for `2-family.sql`: it changes the table's key so entries belong to a family. Your entries stay put.

Both scripts are **safe to run again**, in any order. Run `2-family.sql` again whenever you update Cradle from this repo, in case it changed.

## 3. Turn on sign-ups

Open **Authentication**, then **Sign In / Providers**:

- **Allow new users to sign up**: **on**. People create their own accounts from Cradle's sign-in screen.
- Open the **Email** provider and turn **Confirm email** **off**, then save.

Why turn off confirmation? Supabase's built-in email service only delivers to members of your Supabase team, and only a few emails an hour. With confirmation on, friends and family would wait for an email that never arrives. If you later connect your own email sender (see [Optional: real emails](#optional-real-emails)), you can turn it back on.

> **Already have accounts stuck at "confirm your email"?** Turning the setting off doesn't fix accounts created before the change. Confirm them in **SQL Editor**:
> ```sql
> update auth.users set email_confirmed_at = now()
> where email = 'their@email.com' and email_confirmed_at is null;
> ```
> For a username account, the email is the username plus `@cradle.cfg`. More queries like this are in [`supabase/admin-queries.sql`](../supabase/admin-queries.sql), explained in [Deployment and architecture](deployment.md#admin-queries).

## 4. Point Cradle at your project

Find two values in Supabase. The **Connect** button at the top of your project shows both, and so does **Project Settings**:

- **Project URL**, like `https://abcdefghijkl.supabase.co`
- **Publishable key**, starting with `sb_publishable_`. If your project only shows older keys, use the one labeled **anon** / **public**.

These go in **environment variables**, never in the repo:

| Variable | Value |
|---|---|
| `CRADLE_SUPABASE_URL` | Your project URL |
| `CRADLE_SUPABASE_KEY` | Your publishable key |
| `CRADLE_DONATE_URL` | *Optional.* A donation link (Buy Me a Coffee, Ko-fi, PayPal.me), shown as **☕ Buy me a coffee** in the profile menu and About. Must start with `https://`. Leave it out to hide the button. |

- **On Netlify:** set them under **Site configuration**, then **Environment variables** (step 5).
- **On your computer:** copy [`.env.example`](../.env.example) to `.env` and fill it in. `.env` is in `.gitignore`, so it's never committed.

Real environment variables win over `.env`. The build refuses to run if the key is a **secret** key (`sb_secret_…`, or the older `service_role` key). That key bypasses the database rules and must never go in the app, the repo, or a chat.

The publishable key is built to be seen by browsers: the database rules from step 2 do the protecting, and anyone who opens your site can find the key in the page. Keeping it out of the repo just keeps your project details out of your code history.

If you skip this step, the app still works, but everyone has to type the address and key under **Database settings** on the sign-in screen, once per phone.

## 5. Build and deploy

### Option A: Netlify builds from this repo (recommended)

1. In [Netlify](https://app.netlify.com), choose **Add new site**, then **Import an existing project**, and pick this GitHub repo.
2. Netlify reads [`netlify.toml`](../netlify.toml): build command `python3 build_pwa.py`, publish folder `pwa`. Leave those as they are.
3. Before the first deploy, add `CRADLE_SUPABASE_URL` and `CRADLE_SUPABASE_KEY` under **Site configuration**, then **Environment variables**. If they're missing, the Netlify build stops with a message saying so and your last good deploy stays live; add them and choose **Deploys**, then **Trigger deploy**.
4. Deploy. Every push to `main` redeploys automatically.

### Option B: build on your computer and drag it in

```bash
cp .env.example .env      # once; then fill in your values
python3 build_pwa.py
```

This creates a `pwa/` folder. In Netlify, choose **Add new site**, then **Deploy manually**, and drag the `pwa` folder in. To update later, open the site's **Deploys** page and drag the new `pwa` folder in.

### What the build does

- Removes any built-in starter log from `cradle.html`, so personal data never reaches a public site
- Bakes in your project URL and publishable key from the environment variables or `.env`
- Writes the site's security headers (`pwa/_headers`): a strict Content-Security-Policy and related headers, which Netlify applies automatically
- Adds the app manifest, icons, and an offline helper (service worker) so Cradle can be installed and works without a connection

Any static host works (GitHub Pages, Cloudflare Pages, your own server), as long as it serves over **https**. Installing and offline mode need https.

## 6. Install it on phones

Open your Netlify link on the phone:

- **Android (Chrome):** menu ⋮, then **Install app** or **Add to Home screen**
- **iPhone (Safari):** Share, then **Add to Home Screen**

Then tap **New here? Create an account**. The first person leaves the share key blank to start the family. Everyone else enters that person's **share key**: find it in the profile menu under **Family**, where the **Share** button writes the invite text. See [Accounts and families](accounts-and-families.md).

Installed, Cradle opens full screen, works offline, and keeps the screen awake during Night shift and Calm.

## Updating

Rebuild and redeploy (or push to GitHub with Option A). Phones get the new version the next time Cradle is opened with a connection. The app checks the network first, then falls back to its saved copy offline. If a phone seems stuck on an old version, close Cradle completely and open it again.

When an update includes changes to `supabase/2-family.sql` (or `3-notifications.sql`, if you use notifications), run it again in the SQL Editor. If `supabase/functions/cradle-notify/index.ts` changed, paste it into the function again and choose **Deploy updates**. Check the [changelog](../CHANGELOG.md).

## Optional: notifications

So phones can get a notification when a feed is due, even with Cradle closed: run [`supabase/3-notifications.sql`](../supabase/3-notifications.sql), create the Edge Function (named exactly `cradle-notify`, all lowercase), and schedule it with [`supabase/4-notify-schedule.sql`](../supabase/4-notify-schedule.sql). About 10 minutes, all in the Supabase dashboard. Step by step: [Notifications](notifications.md#setting-them-up-once-for-your-cradle).

## Optional: real emails

Cradle doesn't need email to work. If you want password-reset emails, or invite emails that arrive:

1. **Connect an email sender** under **Project Settings**, then **Authentication**, then **SMTP**. Free tiers from providers like Resend or Brevo work; you'll need a domain you own.
2. **Set the link target:** under **Authentication**, then **URL Configuration**, set **Site URL** to your Netlify address.
3. **Optional invite template:** paste [`supabase/invite-email.html`](../supabase/invite-email.html) into **Authentication**, then **Emails**, then **Templates**, then **Invite user**. Set the subject to something like *You're invited to Cradle 💛*.

When someone taps an invite or reset link, Cradle signs them in and asks them to create a new password.

## Optional: an Android app file (APK)

The installed web app is usually all you need. If you want an APK to share, [PWABuilder](https://www.pwabuilder.com) can package your Netlify link into one. It's still the same web app inside, with the same limits (for example, it can't set Clock alarms, but [notifications](notifications.md) work).

## Keeping it awake

Free Supabase projects pause after about a week without any activity. Daily logging counts as activity. If it does pause, open the project in Supabase and choose **Restore**; nothing is lost, and phones keep working offline in the meantime.
