# ReachOut

Backend-driven LinkedIn network outreach CRM.

## Architecture
The browser is UI only. LinkedIn CSV parsing, imports, database reads/writes, message analysis and recommendation scoring run in Next.js server/API routes on Vercel. Supabase is used for private file storage and Postgres.

For files larger than Vercel's request limit, the browser receives a short-lived signed Supabase Storage upload URL; the browser only transfers the raw file. The backend then downloads and parses it. No LinkedIn data is parsed or scored in React.

## Setup
1. Connect the project to the Supabase Vercel Marketplace integration.
2. Run `supabase.sql` once in Supabase SQL Editor.
3. Deploy to Vercel.
4. Visit `/api/health` on the deployed domain. It should return `ok: true` and show `imports`, `connections`, `messages`, and `storage` as healthy.
5. Upload LinkedIn Connections.csv and messages.csv from the app.

The backend accepts the Marketplace variables `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, with legacy fallbacks for older projects.
