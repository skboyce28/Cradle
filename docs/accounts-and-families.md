# Accounts and families

Everyone who uses Cradle has **their own account**. Accounts belong to a **family**, and a family shares **one log**: every feed, diaper, note, weight, and setting anyone in the family saves shows up on everyone's phones, usually within a few seconds.

A family is one baby's log. Different families on the same Cradle site are completely separate.

---

## Creating an account

On the sign-in screen, tap **New here? Create an account**:

| Field | What to enter |
|---|---|
| Username or email | A real email is best. A plain username like `grandma` also works. |
| Password | At least 8 characters, typed twice |
| Share key (optional) | The key from the family you're joining, like `K7QM-4XPD`. Leave it blank to start your own family. |

- **With a share key**, you join that family and see a welcome screen. Keys aren't fussy: `k7qm4xpd` works too.
- **Without one**, you get a new, empty family of your own, and Cradle opens Settings so you can enter the baby's name and birth date.
- **If the key doesn't match**, the account is still created with its own family. Join later from **Family** (below).

### Usernames vs. emails

A username is stored as `username@cradle.cfg`. That address doesn't receive mail, so:

- **There's no "forgot password" for username accounts.** Write the password down.
- Supabase sometimes rejects made-up addresses at sign-up. If that happens, Cradle asks for a real email instead.

To sign in, type just the username (`grandma`), or the full email for email accounts.

## The Family screen

Open the profile menu (the round button, top right), then **Family**.

| Section | What it does |
|---|---|
| **Name** | Rename the family. It starts as "*Baby*'s family" once the baby's name is set. |
| **People** | Everyone in the family, and who is the **Owner**. The owner can remove people (×). |
| **Share key** | The key others use to join. **Copy** it, or **Share** to send a ready-made invite message with your link and the steps. |
| **New key** (owner only) | Makes a fresh key; the old one stops working immediately. People already in the family stay in. Use it if a key got passed around. |
| **Add someone by email** | For someone who **already has** a Cradle account. They join the next time they open Cradle. |
| **Join with a share key** | Switch this account to another family's log. |
| **Leave this family** (members only) | Stop seeing this log. Your phone clears its copy. Entries you added stay with the family. You get your own empty family. |

### Owners and members

- The person who starts a family is its **owner**. Everyone who joins is a **member**.
- Everyone in a family can log, edit, and delete entries, change settings, rename the family, and share the key.
- Only the owner can **remove people** and make a **new key**.
- The owner can't leave their own family. That keeps every family with someone in charge.

## What happens to the log on a phone

| Situation | What happens |
|---|---|
| **First sign-in** on a phone that already has a log (for example, from before accounts existed) | The log is **added** to your family. The sign-in screen shows how many feeds the phone has and offers **Download a backup first**. |
| **Joining a family** when you're the only person in your current family | Your entries come with you into the new family. |
| **Joining a family** when your current family has other people | The phone starts fresh with the new family's log, so one family's entries never leak into another's. The old log stays with the old family. |
| **Leaving** a family | The phone clears that family's log. |
| **A different person signs in** on a phone | The phone starts fresh for them. The previous person's log is safe in their account and comes back when they sign in again. |
| **Signing out** | The log stays on the phone until someone signs in. |

## Who can see what

- You see **only your family's** log. The database enforces this, not just the app, so even someone with a modified copy of Cradle can't read or change another family's entries.
- A share key is the only way in. After **10 wrong keys in an hour**, an account is locked out of joining for the rest of that hour, so keys can't be guessed by trying thousands of them.
- **Add by email** only works for accounts that already exist, and only an account created *before* you added the email can accept. A stranger can't sign up with your partner's address afterward and take their place. Share keys are still the simplest and safest way to invite.
- **The person who runs the Supabase project can see every family's data** in the Supabase dashboard. If you open your Cradle to friends, tell them.

## Changing your password

Profile menu, then **Change password**. At least 8 characters.

## Signing out

Profile menu, then **Sign out**. Your log stays saved in your account.

## Running a Cradle for other families

If you share your site with friends, each of their families is separate from yours. A few things to know as the operator:

- **Anyone with your link can create an account.** They only ever get their own empty family. To close sign-ups, turn off **Allow new users to sign up** in Supabase (**Authentication**, then **Sign In / Providers**). Existing accounts keep working.
- **To reset a forgotten password** without email set up, you can delete the person's account in Supabase (**Authentication**, then **Users**) and have them sign up again with the same share key. Their family's log is untouched: entries belong to the family, not the person, and deleting an account never deletes entries. If they were a family's only member, export the log first, because nobody else could reach it.
- Everything lives in your free Supabase project, which has storage and activity limits. A handful of families is no problem.
