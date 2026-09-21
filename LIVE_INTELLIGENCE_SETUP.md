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
