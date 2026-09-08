# ReachOut

ReachOut is a network intelligence MVP: upload LinkedIn Connections and Messages exports, tell it the role you want, and it ranks who to contact and who is due for follow-up.

## Architecture

- Next.js 14 frontend + API routes
- Supabase Postgres for persistent connections/messages/imports
- Supabase private Storage for raw uploaded CSVs
- Server-side parsing with Papa Parse
- Batch upserts + database deduplication
- Server-side recommendation and follow-up scoring
- Direct-to-Storage uploads so large CSVs do not have to pass through a Vercel function

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase.sql`.
3. In Vercel, add:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not expose it in client code.

4. Redeploy Vercel.

The current MVP uses an anonymous browser-generated user ID so there is no auth setup required for the prototype. Add Supabase Auth before sharing the product with multiple users.

## Local development

```bash
npm install
npm run dev
```

## LinkedIn import

ReachOut can accept multiple CSVs at once and in any order. It detects Connections vs Messages from the file contents/name, stores the raw file in private Storage, parses it on the server, batches rows into Postgres, and deduplicates repeated exports.

## Current recommendation logic

For a target such as Product Manager, the backend considers:

- title similarity to the target role
- founders/executives/heads of product/hiring and recruiting roles
- existing conversation history
- whether the person has replied
- whether an outgoing message is unanswered
- how long it has been since the last outgoing message

Jobs are intentionally not part of this version yet; they can be added as a separate signal later.


## Vercel + Supabase

Use the official Supabase integration in Vercel. It automatically syncs the Supabase project URL and publishable/secret keys to the Vercel project. This app expects `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY`.

After connecting the integration, run `supabase.sql` once in the Supabase SQL Editor, then redeploy.
