import { NextResponse } from 'next/server'
import { authenticatedUser, supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const user = await authenticatedUser(req)
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('live_signals')
      .select('id,connection_id,linkedin_url,first_name,last_name,company,position,signals,score,summary,last_checked_at,source_count,sources')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .order('last_checked_at', { ascending: false })
      .limit(250)
    if (error) throw new Error(error.message)
    return NextResponse.json({ signals: data || [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load live intelligence.' }, { status: 401 })
  }
}

export async function POST(req: Request) {
  try {
    const cronUserId = req.headers.get('x-reachout-cron')
    const cronSecret = process.env.CRON_SECRET
    let userId = ''
    if (cronUserId && cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) userId = cronUserId
    else userId = (await authenticatedUser(req)).id
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 25)
    const supabase = supabaseAdmin()
    const { data: connections, error } = await supabase
      .from('connections')
      .select('id,linkedin_url,first_name,last_name,company,position,connected_on,email')
      .eq('user_id', userId)
      .not('company', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)

    const usable = (connections || []).filter((c: any) => String(c.company || '').trim()).slice(0, limit)
    if (!usable.length) return NextResponse.json({ updated: 0, signals: [] })

    // IMPORTANT: keep free-tier usage low.
    // Analyze the whole batch in ONE Gemini request instead of one request per person.
    const analyzed = await researchPeopleBatch(usable)
    const results: any[] = []

    for (const person of usable) {
      const result = analyzed.get(String(person.id)) || {
        signals: [],
        score: 0,
        summary: `No strong recent public signal found for ${person.company || 'this contact'}.`,
        sources: [],
      }

      const row = {
        user_id: userId,
        connection_id: person.id,
        linkedin_url: person.linkedin_url || '',
        first_name: person.first_name || '',
        last_name: person.last_name || '',
        company: person.company || '',
        position: person.position || '',
        signals: result.signals,
        score: result.score,
        summary: result.summary,
        last_checked_at: new Date().toISOString(),
        source_count: result.sources.length,
        sources: result.sources,
      }

      const { data: saved, error: saveError } = await supabase
        .from('live_signals')
        .upsert(row, { onConflict: 'user_id,connection_id' })
        .select('id,connection_id,linkedin_url,first_name,last_name,company,position,signals,score,summary,last_checked_at,source_count,sources')
        .single()

      if (saveError) throw new Error(saveError.message)
      results.push(saved)
    }

    return NextResponse.json({ updated: results.length, signals: results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not refresh live intelligence.' }, { status: 500 })
  }
}

async function researchPeopleBatch(people: any[]) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Live web intelligence is not configured yet. Add GEMINI_API_KEY in Vercel.')

  // Fetch public news for all contacts first. This does not consume Gemini quota.
  const sourceByPerson = new Map<string, NewsItem[]>()
  const allNews: { personId: string; name: string; company: string; items: NewsItem[] }[] = []

  for (const person of people) {
    const name = `${person.first_name || ''} ${person.last_name || ''}`.trim()
    const company = String(person.company || '').trim()
    const queries = [
      `${name} ${company}`,
      `${company} funding OR hiring OR launch OR expansion`,
    ].filter(Boolean)

    const items = await fetchGoogleNewsRss(queries)
    sourceByPerson.set(String(person.id), items)
    allNews.push({
      personId: String(person.id),
      name,
      company,
      items,
    })
  }

  const input = allNews.map((p, index) => {
    const sources = p.items.length
      ? p.items.map((item, i) =>
          `  ${i + 1}. ${item.title}\n     Publisher: ${item.publisher || 'Unknown'}\n     Date: ${item.pubDate || 'Unknown'}\n     URL: ${item.link}`
        ).join('\n')
      : '  No current public news results.'

    const person = people[index]
    return `CONTACT ${index + 1}
ID: ${p.personId}
Person: ${p.name}
Current listed role: ${String(person.position || 'unknown')}
Company: ${p.company}
LinkedIn URL: ${person.linkedin_url || 'not provided'}
Sources:
${sources}`
  }).join('\n\n')

  const prompt = `You are the live intelligence engine for a professional networking product.

Analyze ALL contacts below in ONE pass using ONLY the supplied current public news sources.
Do not invent facts. Do not claim you searched the web beyond these sources.

For each contact, identify useful recent signals that could explain why they may be worth
reaching out to now. Prioritize:
1. Recent job or leadership change.
2. Company hiring, especially product, recruiting, growth, or roles related to the user's target.
3. Funding, acquisition, expansion, major launch, or growth.
4. Relevant company/person news.
5. Other strong professional connection signals visible in the supplied sources.

Only include signals supported by a supplied source. If there is no useful signal, return
an empty signals array and a short explanation.

Return JSON ONLY:
{
  "results": [
    {
      "id": "contact ID",
      "score": 0,
      "summary": "one sentence",
      "signals": [
        {
          "type":"hiring|funding|role_change|launch|growth|news|other",
          "label":"short label",
          "detail":"short factual detail",
          "date":"YYYY-MM-DD or empty",
          "strength":"high|medium|low"
        }
      ]
    }
  ]
}

CONTACTS:
${input}`

  // ONE Gemini request for the whole refresh.
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'gemini-3.6-flash',
      input: prompt,
      store: false,
    }),
    cache: 'no-store',
  })

  const data = await response.json()
  if (!response.ok) {
    const message = data?.error?.message || 'Gemini analysis failed.'
    throw new Error(message)
  }

  const outputSteps = Array.isArray(data?.steps)
    ? data.steps.filter((step: any) => step?.type === 'model_output')
    : []
  const text = outputSteps
    .flatMap((step: any) => Array.isArray(step?.content) ? step.content : [])
    .map((part: any) => part?.text || '')
    .join('') || '{}'

  let parsed: any = {}
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    try { parsed = match ? JSON.parse(match[0]) : {} } catch { parsed = {} }
  }

  const resultMap = new Map<string, any>()
  const results = Array.isArray(parsed?.results) ? parsed.results : []

  for (const person of people) {
    const id = String(person.id)
    const raw = results.find((x: any) => String(x?.id) === id) || {}
    const sourceItems = sourceByPerson.get(id) || []
    const signals = Array.isArray(raw.signals)
      ? raw.signals.slice(0, 6).map((s: any) => ({
          type: String(s.type || 'other'),
          label: String(s.label || 'Recent signal'),
          detail: String(s.detail || ''),
          date: String(s.date || ''),
          strength: String(s.strength || 'medium'),
        })).filter((s: any) => s.detail)
      : []

    resultMap.set(id, {
      score: Math.min(100, Math.max(0, Number(raw.score) || Math.min(55 + signals.length * 8 + (sourceItems.length ? 5 : 0), 90))),
      summary: String(raw.summary || (signals[0]?.detail || `No strong recent public signal found for ${person.company || 'this contact'}.`)),
      signals,
      sources: sourceItems.slice(0, 8).map(item => ({
        title: item.title,
        url: item.link,
      })),
    })
  }

  return resultMap
}

type NewsItem = {
  title: string
  link: string
  pubDate: string
  publisher: string
}

async function fetchGoogleNewsRss(queries: string[]): Promise<NewsItem[]> {
  const all: NewsItem[] = []
  const seen = new Set<string>()

  for (const query of queries) {
    try {
      const url =
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
        `&hl=en-IN&gl=IN&ceid=IN:en`

      const response = await fetch(url, {
        headers: { 'User-Agent': 'ReachOut/1.0' },
        cache: 'no-store',
      })
      if (!response.ok) continue

      const xml = await response.text()
      const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || []

      for (const raw of itemMatches.slice(0, 8)) {
        const title = decodeXml(getXmlValue(raw, 'title'))
        const link = decodeXml(getXmlValue(raw, 'link'))
        const pubDate = decodeXml(getXmlValue(raw, 'pubDate'))
        const source = decodeXml(getXmlValue(raw, 'source'))

        if (!title || !link || seen.has(link)) continue
        seen.add(link)
        all.push({ title, link, pubDate, publisher: source })
      }
    } catch {
      // One failed RSS query should not prevent the other query from working.
    }
  }

  all.sort((a, b) => {
    const da = Date.parse(a.pubDate || '') || 0
    const db = Date.parse(b.pubDate || '') || 0
    return db - da
  })

  return all.slice(0, 12)
}

function getXmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return match?.[1]?.trim() || ''
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
