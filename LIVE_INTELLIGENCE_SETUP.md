# Live Intelligence setup

## Supabase
Run `supabase.sql` after your existing ReachOut schema. The Live Intelligence migration adds `status`, `primary_type`, and `why_now` to `live_signals`.

## Vercel
Add this server-side environment variable:

`TAVILY_API_KEY=your_key`

Do **not** expose this key as `NEXT_PUBLIC_*`.

## Behaviour
Live Intelligence searches public web results for contacts already in the user's ReachOut network. It does not scrape LinkedIn itself. The UI groups results into:

- Hiring
- Funding
- Career
- Company
- News

Each card contains a concise `why now` explanation and expandable source links.

## Refresh reliability

Live Intelligence refreshes in batches of 5 contacts per click to keep Vercel requests small. Each refresh advances to the next 5 connections and wraps back to the beginning after the end of the list.

The UI now shows whether the refresh checked contacts, found signals, timed out, or failed because configuration/data is missing.

Required Vercel environment variable:
- `TAVILY_API_KEY`

Required Supabase table:
- `live_signals` (run the included `supabase.sql` if it does not exist)

If the UI says there are no connections with companies, import LinkedIn `Connections.csv` first.
