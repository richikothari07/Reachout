# Reachout MVP

A Next.js MVP for a personal job-search CRM. Upload LinkedIn Connections.csv, messages.csv, and a simple jobs CSV. Everything in this MVP is parsed client-side; no uploaded file is sent anywhere.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Jobs CSV

Use headers such as:

```csv
company,title,location,url,posted
Stable Money,Product Manager,Bengaluru,https://...,2 days ago
```

## Next steps

1. Persist parsed data in Supabase.
2. Add authentication.
3. Replace the heuristic score with a richer matching model.
4. Add an OpenAI server route for message drafting and conversation summarization.
5. Add outreach state and follow-up dates.
6. Add a jobs ingestion source/API with appropriate terms and permissions.

Note: LinkedIn exports can contain multiline CSV fields. Papa Parse is used to correctly parse quoted multiline message content.
