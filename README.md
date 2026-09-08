# ReachOut

ReachOut is a backend-driven network outreach CRM for LinkedIn exports.

## Architecture

The browser is a thin UI. LinkedIn CSV parsing, validation, deduplication, message analysis, ranking and database writes happen on Vercel server routes and Supabase.

- `/api/import/upload` receives small CSV files on the Vercel backend and writes them to private Supabase Storage.
- Files larger than the Vercel request limit automatically use a short-lived signed Storage upload; **the file is still processed only by the backend**.
- `/api/import/process` downloads the uploaded file server-side, detects the LinkedIn export type, parses it and writes normalized rows to Postgres.
- `/api/dashboard` reads the database and calculates message stats and recommendations server-side.
- `/api/people/messages` reads conversations server-side.
- The browser never parses the LinkedIn exports and no Supabase database queries are made from React.

## Supabase setup

Run `supabase.sql` once in Supabase SQL Editor. It creates `imports`, `connections`, `messages`, indexes, and the private `reachout-imports` bucket.

## Vercel environment variables

Use the Vercel Supabase integration. The server requires:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

The browser does not require a Supabase key for the application logic.

## Deployment

Push the project to GitHub and connect it to Vercel. After changing environment variables, create a new deployment.
