# Troubleshooting

## Signing in

**"Account created, but this Cradle still has email confirmation on"**
Turn off **Confirm email** in Supabase (**Authentication**, then **Sign In / Providers**, then **Email**), then confirm the stuck account. In **SQL Editor**:
```sql
update auth.users set email_confirmed_at = now()
where email = 'their@email.com' and email_confirmed_at is null;
```
For a username account, use `username@cradle.cfg`. Then they tap **Sign in**, not *Create account*. A share key they entered at sign-up is remembered and applied on that first sign-in.

**"Wrong username or password"**
- Usernames aren't case-sensitive, but passwords are.
- For an email account, type the full email.
- To reset a forgotten password without email set up, see [Accounts and families](accounts-and-families.md#running-a-cradle-for-other-families).

**"That username already has an account"**
Someone already took it. Tap **I already have an account** if it's yours, or pick another name.

**"The database didn't accept that username"**
Supabase sometimes rejects made-up addresses at sign-up. Use a real email instead.

**"New accounts are turned off for this Cradle"**
The operator turned off **Allow new users to sign up** in Supabase.

**"Couldn't reach the database"**
- Check the connection.
- If it keeps happening, the free Supabase project may be **paused** after a week without use. Open it in Supabase and choose **Restore**.

**The sign-in screen asks for a database address and key**
The site was built without `CRADLE_SUPABASE_URL` and `CRADLE_SUPABASE_KEY`. On Netlify, add both under **Site configuration**, then **Environment variables**, then choose **Deploys**, then **Trigger deploy**. Users shouldn't need to enter them.

**Netlify build failed: "Missing CRADLE_SUPABASE_URL and CRADLE_SUPABASE_KEY"**
Same fix. The build stops on purpose so a site that asks users for database details never goes live; your previous deploy stays up meanwhile. See [Setup](setup.md#4-point-cradle-at-your-project).

## Families

**Joined at sign-up but don't see the family's log**
- Wait a few seconds, or close and reopen Cradle.
- Check **Family** in the profile menu. If you're not listed in that family, join there with the share key.

**"That share key didn't match a family"**
- Check for typos. Dashes and capital letters don't matter.
- The owner may have made a **New key**. Ask for the current one.

**"Too many wrong keys"**
Ten wrong tries in an hour locks joining for that account for the rest of the hour.

**"No Cradle account uses that email yet"**
*Add by email* only works for existing accounts. Send them your share key instead.

## My log is missing

**After updating the app, or on the sign-in screen**
- The log is still on the phone. The sign-in screen says how many feeds it has and offers **Download a backup first**.
- Signing in or creating an account adds it to your family.
- **Don't** clear the browser's data, use a private tab, or uninstall Cradle first: those really do erase it.

**The sign-in screen doesn't mention any feeds**
Each web address keeps its own storage. Make sure you're opening the **same address** in the **same browser** as before. An installed app from an old link and the current site count as different places.

**After someone else signed in on this phone**
The phone starts fresh for each different account, so logs never mix. Your log is safe in your account; sign back in to see it.

**After joining or leaving a family**
See [What happens to the log on a phone](accounts-and-families.md#what-happens-to-the-log-on-a-phone).

**Restoring from a backup**
Profile menu, then **Import data**, then choose the file or paste the `CRADLE1:` code, then **Merge**.

**"Only the family owner can erase the whole log"**
Erase all data is limited to the family owner, because it clears every phone in the family. Members can still delete single entries with ×. To change who the owner is, see query 9 in [`supabase/admin-queries.sql`](../supabase/admin-queries.sql).

**Clearing Cradle off a shared or lost phone**
Profile menu, then **Sign out and remove from this phone**. If the phone is lost, also change your password from another phone (profile menu, then **Change password**).

## Sync

The cloud icon in the header shows the state:

| Icon | Meaning |
|---|---|
| ☁︎ | Synced |
| ⟳ | Syncing |
| ⚠︎ | Offline, or a sync problem. The profile menu shows which, under your name. |

**An entry isn't showing on the other phone**
- Both phones need a connection.
- Changes arrive within about 15 seconds while Cradle is on screen. Opening the app syncs right away.
- If one phone says **Sync problem**, sign out and back in on that phone. Its unsent entries upload when it reconnects.

## Alarms

**The alarm didn't ring**
- Cradle only rings while it's **open on screen**. Tap the screen once after opening it so your phone allows sound.
- Check that the alarm is on in Settings.
- When installed as an app, Night shift and Calm keep the screen awake.

**⏰ Set alarm doesn't open my Clock app**
That's expected, even with Cradle installed: phones don't let web apps create Clock alarms. The button shows the time and the steps (Open Clock, Tap +, Pick the time). See [Known limits](../README.md#known-limits).

## Printing and files

**Print or Download does nothing**
Open Cradle in a real browser (Chrome, Safari) or as the installed app, not inside a file preview, email attachment, or chat app's viewer.

**Text message export doesn't open Messages**
Use **📋 Copy code** on the export screen and paste it into any message, or use **Download file** or **Share file**.

## Updates

**A phone is stuck on an old version**
Close Cradle completely (swipe it away) and open it with a connection. If it's still old, open the site in the browser once, then reopen the installed app.
