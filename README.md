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
