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

## Two-step sign-in

**"That code didn't match"**
- Use the newest code in the app; each lasts 30 seconds.
- Codes depend on the phone's clock. Make sure the phone with the authenticator app sets its date and time automatically.
- Use the code listed under **Cradle** in the app, not another site's.

**Lost the phone with the authenticator app**
There are no backup codes. Whoever runs your Cradle resets it with [admin query 27](deployment.md#admin-queries). Then sign in with just your password, and set it up again if your family requires it.

**"Two-step sign-in is turned off for this database"**
In Supabase, open **Authentication**, then **Multi-Factor** (or **Sign In / Providers**, depending on the dashboard version) and make sure **TOTP (App Authenticator)** is enabled. It's on by default.

**A family member sees "Set up two-step sign-in" and can't get past it**
The family owner requires it. They can finish setting it up (it takes about a minute), tap **Sign out**, or the owner can untick **Require it for everyone** under **Family**.

**The Family screen has no Two-step sign-in section**
The database script is older than v1.25. Run `supabase/2-family.sql` again in the SQL Editor. Turning it on for yourself works without it, but the database only enforces it after the rerun.

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
Profile menu, then **Data management**, then **Import data**, then choose the file or paste the `CRADLE1:` code, then **Merge**.

**"Only the family owner can erase the whole log"**
Erase all data is limited to the family owner, because it clears every phone in the family. Members can still delete single entries with ×. To change who the owner is, see query 9 in [`supabase/admin-queries.sql`](../supabase/admin-queries.sql).

**Clearing Cradle off a shared or lost phone**
Profile menu, then **Data management**, then **Sign out and remove from this phone**. If the phone is lost, also change your password from another phone (profile menu, then **Sign-in and security**, then **Change password**).

## Sync

The cloud icon in the header shows the state:

| Icon | Meaning |
|---|---|
| ☁︎ | Synced |
| ⟳ | Syncing |
| ⚠︎ | Offline, or a sync problem. The profile menu shows which, under your name. |

**Two of us edited the same feed**
Edits to different boxes are combined. If you both changed the *same* box, the change that synced last wins on every phone; just fix it again. The note at the bottom says who made the last change.

**A weight is wrong**
Profile menu, then **Weights** (or **See all** on the Dashboard), then **Edit** next to it. Weights from a weighted feed are changed on that feed (**Open feed**), and the birth weight in **Settings**.

**An entry isn't showing on the other phone**
- Both phones need a connection.
- Changes arrive within about 15 seconds while Cradle is on screen. Opening the app syncs right away.
- If one phone says **Sync problem**, sign out and back in on that phone. Its unsent entries upload when it reconnects.

## Alarms

**The alarm didn't ring**
- Cradle only rings while it's **open on screen**. Tap the screen once after opening it so your phone allows sound.
- Check that the alarm is on in Settings.
- When installed as an app, Night shift and Calm keep the screen awake.

**I want to be told when Cradle is closed**
Turn on **Notify this phone** in Settings. If it says *Not set up* or *Almost ready*, see [Notifications](notifications.md#troubleshooting).

**⏰ Set alarm doesn't open my Clock app**
That's expected, even with Cradle installed: phones don't let web apps create Clock alarms. The button shows the time and the steps (Open Clock, Tap +, Pick the time). See [Known limits](../README.md#known-limits).

## Printing and files

**Print or Download does nothing**
Open Cradle in a real browser (Chrome, Safari) or as the installed app, not inside a file preview, email attachment, or chat app's viewer.

**Text message export doesn't open Messages**
Use **📋 Copy code** on the export screen and paste it into any message, or use **Download file** or **Share file**.

## Profile pictures

**"Profile pictures need a quick database update"**
Whoever runs your Cradle needs to run [`supabase/2-family.sql`](../supabase/2-family.sql) again (v1.22 added pictures).

**My family sees a letter instead of my picture**
Check **Who can see it** under **Your picture**: **Only me** shows the letter to everyone else. Pictures refresh on other phones within about 10 minutes, or right away when they open the Family screen.

**A photo won't upload**
Use a regular photo (JPEG, PNG, WebP, or an iPhone photo, which the phone converts). Very unusual formats may not open in the browser.

## Terms and privacy

**"This copy of Cradle has different terms."** The terms changed on the server, and this phone has an older copy of Cradle. Close Cradle completely and open it again (or refresh the browser) to get the latest version.

**The terms screen keeps coming back.** Tap **Agree and continue** and wait for it to close. If it says it couldn't save, check the connection. Until the terms are accepted, the log doesn't sync on that phone.

## Owlet Dream Sock

See [Owlet troubleshooting](owlet.md#troubleshooting): wrong password or region, *This Cradle isn't set up for Owlet yet*, *Owlet signed Cradle out*, and sleep that isn't logged.

## Fun center

**"High scores aren't set up on this Cradle yet"**
Whoever runs your Cradle needs to run [`supabase/2-family.sql`](../supabase/2-family.sql) again in the Supabase SQL Editor. Daily Word (v1.18) and Stork Flight (v1.19) added to it. Until then, Stork Flight scores wait on the phone and post once it's done. It's safe to rerun and keeps everything already there.

**Daily Word says "Already posted for this day from another phone"**
Each account gets one Daily Word result per day, from whichever phone finishes first. The other phone shows that result.

**Daily Word says "Too late to post this day's word"**
A result can only post within about a day, so one played offline and synced days later stays on the phone. It still counts toward your stats and badges there.

**Someone wants to play a day again**
An admin can remove that day's result with query 20c in [`supabase/admin-queries.sql`](../supabase/admin-queries.sql). The phone that played it still remembers it, so they'd play again on another phone.

**Everyone in the family got a different word**
The word depends on the length you picked (4, 5, or 6) and the phone's date. Pick the same length to get the same word. Around midnight, phones in different time zones can be a day apart.

## Support

**Support says to sign in first.** Feedback is saved in your Cradle's database, so it needs an account.

**"That's 10 today."** Each account can send 10 a day. Try again tomorrow, or add to one you sent.

**The screenshot won't add.** Choose an image (PNG, JPEG, or similar). Very large screenshots are shrunk on the phone; if it still says it's too big, crop it first.

**I don't see a Feedback inbox.** Only admins do. Whoever runs the Supabase project adds them with admin query 31 (see [Support admins](deployment.md#support-admins)). If you just became an admin, close Support and open it again. If you use two-step sign-in, finish the code step first.

**No achievement yet.** Quality Assurance comes when an admin marks your feedback anything but New. Support refreshes about every 10 minutes and whenever you open it.

## Updates

**A phone is stuck on an old version**
Close Cradle completely (swipe it away) and open it with a connection. If it's still old, open the site in the browser once, then reopen the installed app.
