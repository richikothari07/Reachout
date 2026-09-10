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

## Groq AI setup

ReachOut now supports AI-generated outreach and follow-up messages through Groq. The API key is used only server-side in `/api/ai` and is never exposed to the browser.

1. Create a Groq API key.
2. In Vercel, open the project → Settings → Environment Variables.
3. Add `GROQ_API_KEY` with your key for the environments you deploy to.
4. Optionally add `GROQ_MODEL`; the default is `openai/gpt-oss-20b`.
5. Redeploy.

Open a person in ReachOut and use **Generate with AI**. The prompt includes the user's imported profile, target role, the selected person's details/reasons, and recent conversation history. The numerical match score is never sent to the model or shown in the UI.
