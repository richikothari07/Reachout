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

    const results: any[] = []
    for (const person of usable) {
      const result = await researchPerson(person)
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

async function researchPerson(person: any) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Live web intelligence is not configured yet. Add GEMINI_API_KEY in Vercel.')

  const name = `${person.first_name || ''} ${person.last_name || ''}`.trim()
  const company = String(person.company || '').trim()
  const position = String(person.position || '').trim()

  // Free-tier approach:
  // Gemini 3.6 Flash itself is available on Google's free tier, but Google
  // Search grounding is not available there. Instead, fetch current public
  // headlines through Google News RSS (no API key / paid search quota), then
  // give those sources to Gemini to analyze. This keeps the feature live
  // without requiring paid Gemini Search grounding.
  const rssQueries = [
    `${name} ${company}`,
    `${company} funding OR hiring OR launch OR expansion`,
  ].filter(Boolean)

  const rssItems = await fetchGoogleNewsRss(rssQueries)
  const sourceContext = rssItems.length
    ? rssItems.map((item, i) =>
        `${i + 1}. ${item.title}\nPublisher: ${item.publisher || 'Unknown'}\nDate: ${item.pubDate || 'Unknown'}\nURL: ${item.link}`
      ).join('\n\n')
    : 'No current Google News results were found.'

  const prompt = `You are the live intelligence engine for a professional networking product.
Use ONLY the current public sources supplied below. Do not invent facts and do not claim
you searched the web beyond these sources.

Person: ${name}
Current listed role: ${position || 'unknown'}
Company: ${company}
LinkedIn URL if available: ${person.linkedin_url || 'not provided'}

Find useful, recent signals that could explain why this person may be worth reaching out to now.
Prioritize:
1. Recent job or leadership change for the person.
2. Company hiring, especially product, recruiting, growth, or roles related to the user's target.
3. Recent funding, acquisition, expansion, major launch, or growth.
4. Relevant company or person news.
5. A strong professional connection signal visible from the supplied sources.

Only include a signal when the supplied source supports it. Prefer recent items.
If nothing useful is supported, return an empty signals array and say so briefly.

CURRENT PUBLIC SOURCES:
${sourceContext}

Return JSON only with this shape:
{
  "score": number from 0 to 100,
  "summary": "one sentence explaining the strongest reason now",
  "signals": [
    {"type":"hiring|funding|role_change|launch|growth|news|other","label":"short label","detail":"short factual detail","date":"YYYY-MM-DD or empty","strength":"high|medium|low"}
  ]
}`

  // Gemini 3.6 Flash remains on the free standard API tier. We use the
  // Interactions API as recommended, but deliberately omit Google Search
  // grounding because that tool requires paid-tier access for Gemini 3.x.
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
  if (!response.ok) throw new Error(data?.error?.message || 'Gemini analysis failed.')

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

  const sources = rssItems.slice(0, 8).map(item => ({
    title: item.title,
    url: item.link,
  }))

  const signals = Array.isArray(parsed.signals)
    ? parsed.signals.slice(0, 6).map((s: any) => ({
        type: String(s.type || 'other'),
        label: String(s.label || 'Recent signal'),
        detail: String(s.detail || ''),
        date: String(s.date || ''),
        strength: String(s.strength || 'medium'),
      })).filter((s: any) => s.detail)
    : []

  return {
    score: Math.min(100, Math.max(
      0,
      Number(parsed.score) ||
      Math.min(55 + signals.length * 8 + (sources.length ? 5 : 0), 90)
    )),
    summary: String(
      parsed.summary ||
      (signals[0]?.detail ? signals[0].detail : `No strong recent public signal found for ${company}.`)
    ),
    signals,
    sources,
  }
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
