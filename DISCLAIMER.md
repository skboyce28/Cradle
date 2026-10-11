# Disclaimer

## Not medical advice

Cradle is a personal notebook for logging feeds, diapers, pumping, weights, and Vitamin D. It is **not a medical device** and does not diagnose, treat, or give medical advice.

- The feeding, diaper, and pumping goals in the app are **placeholders**, not clinical guidance. Use the numbers your pediatrician, lactation consultant, or care team gives you.
- Totals, streaks, "goal met" markers, achievements, estimated transfer from weighted feeds, and the doctor report are simple arithmetic on what you typed. They can be wrong if an entry is wrong, missing, or synced late.
- **Don't rely on Cradle's alarm or notifications.** The in-app alarm only rings while the app is open on screen, and a phone can silence it. Notifications need a connection, only know about feeds that have synced, and can arrive late or not at all.
- **If you're worried about your baby,** for example too few wet diapers, signs of dehydration, poor feeding, jaundice, fever, or anything that feels off, **call your pediatrician right away**. In an emergency, call your local emergency number.

## Built with AI

Cradle was designed by its author and **built with AI assistance from Claude, an AI model made by Anthropic**. The AI wrote most of the app's code, the database scripts, and this documentation.

It was tested in a simulated environment: a real Postgres database, stand-ins for Supabase's sign-in service, and an automated browser playing several phones. That is not the same as:

- an independent security review or penetration test
- testing on many real phones and browsers
- clinical validation of any kind

AI-written code can contain mistakes that look correct. Read it before trusting it with anything important, keep backups (profile menu, then **Data management**, then **Export data**), and report problems in the repository's Issues.

## No warranty

See also the No Liability section of the [license](LICENSE.md).

Cradle is provided **"as is", without warranty of any kind**, express or implied, including fitness for a particular purpose. The author and contributors aren't liable for any loss of data, missed feeds, or other harm from using it.

## Your data

Cradle stores your log in your browser and in the Supabase project of whoever runs the Cradle site you use. **That person can see all data in their project.** Only use a Cradle site run by someone you trust, or run your own (see [docs/setup.md](docs/setup.md)). Cradle includes no analytics, ads, or trackers.

Cradle isn't affiliated with or endorsed by Anthropic, Supabase, or Netlify.
