# ReachOut

A network intelligence dashboard for prioritising who to contact next.

## Flow
1. Open ReachOut.
2. Enter your name and target role in the single setup panel.
3. Select Connections.csv and messages.csv together.
4. ReachOut parses the LinkedIn exports server-side and saves normalized rows to Supabase.
5. The dashboard immediately reloads from Supabase and shows counts, ranked people, follow-ups and the people directory.

## Required Vercel environment variables
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)

Run the SQL in `supabase.sql` once in the same Supabase project referenced by `SUPABASE_URL`.

### Completed people + IIT weighting
- People marked **contacted** or **followed up** are removed from the active Opportunities/Outreach/Companies queues and appear under **Completed**.
- Unmarking the relevant status returns the person to the active queue.
- The ranking gives a small additional boost to profiles whose imported education contains IIT / Indian Institute of Technology.
- The ranking also gives a small additional boost to people working at a curated set of well-known startups / scale-ups. This is intentionally a modest nudge so role fit, hiring signals, and relationship strength remain more important.
- If your LinkedIn archive includes an Education/School CSV with First Name, Last Name and School Name, ReachOut can import it to enrich matching. Standard Connections.csv exports generally do not contain education, so the IIT boost only applies when education data is available.
