# ReachOut Home final fixes

- Removed the full-page Home loading state so the dashboard layout renders immediately while data loads.
- Removed the delayed dashboard fetch.
- Disabled the old initial marketing hero fallback on Home.
- Kept the existing Home content and functionality.
- Kept decorations as HTML/CSS/SVG and anchored them to their sections.
- Prevented AI Sidekick decoration from overlapping the Ready status pill.
- Hid decorative artwork on mobile while preserving the content and controls.

## Live Intelligence: public-web signals

Live Intelligence now uses a small, cached signal feed instead of a generic people-discovery screen.

### What it does
- Searches public web results around people and companies in the user's imported LinkedIn network.
- Classifies results into Hiring, Funding, Career, Company and News signals.
- Stores the signal, `why_now`, source links and last-checked time in `live_signals`.
- Shows a clean feed with filters and expandable evidence links.
- Lets the user jump from a signal directly to the existing ReachOut person drawer.

### Setup
1. Run the latest `supabase.sql` in the Supabase SQL editor. The migration is additive and keeps existing `live_signals` data.
2. Create a Tavily API key and add it to Vercel as `TAVILY_API_KEY` for Production/Preview as needed.
3. Redeploy the app.
4. Open **Live Intelligence** and press **Refresh intelligence**.

The refresh searches up to 30 network contacts in small parallel batches. It does not scrape LinkedIn or access private LinkedIn data. It only stores public search results and source links returned by the web-search provider.
