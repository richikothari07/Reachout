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
  const prompt = `You are the live intelligence engine for a professional networking product.
Research this person and their company using current public web information only.
Person: ${name}
Current listed role: ${position || 'unknown'}
Company: ${company}
LinkedIn URL if available: ${person.linkedin_url || 'not provided'}

Find only useful, recent signals that could explain why this person may be worth reaching out to now. Prioritize:
1. Recent job or leadership change for the person.
2. Company hiring activity, especially product, recruiting, growth, or roles related to the user's target.
3. Recent funding, acquisition, expansion, major launch, or growth.
4. Relevant company or person news.
5. A strong professional connection signal visible from public information.

Do not invent facts. If you cannot verify a signal from a current public source, leave it out. Prefer sources from the company's site, reputable news, job pages, or other authoritative public pages. Keep the result concise.

Return JSON only with this shape:
{
  "score": number from 0 to 100,
  "summary": "one sentence explaining the strongest reason now",
  "signals": [
    {"type":"hiring|funding|role_change|launch|growth|news|other","label":"short label","detail":"short factual detail","date":"YYYY-MM-DD or empty","strength":"high|medium|low"}
  ]
}`

  // Use Google's current Interactions API and Gemini 3.6 Flash.
  // The older generateContent + gemini-2.5-flash combination is no longer
  // available to new users. Interactions is Google's recommended API for
  // new Gemini integrations and supports Google Search grounding directly.
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'gemini-3.6-flash',
      input: prompt,
      tools: [{ type: 'google_search' }],
      store: false,
    }),
    cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Gemini web research failed.')

  const outputSteps = Array.isArray(data?.steps)
    ? data.steps.filter((step: any) => step?.type === 'model_output')
    : []
  const text = outputSteps
    .flatMap((step: any) => Array.isArray(step?.content) ? step.content : [])
    .map((part: any) => part?.text || '')
    .join('') || '{}'

  let parsed: any = {}
  try { parsed = JSON.parse(text) } catch {
    // Be tolerant if the model wraps the JSON in markdown despite the prompt.
    const match = text.match(/\{[\s\S]*\}/)
    try { parsed = match ? JSON.parse(match[0]) : {} } catch { parsed = {} }
  }

  const sources = extractInteractionSources(data)
  const signals = Array.isArray(parsed.signals) ? parsed.signals.slice(0, 6).map((s: any) => ({
    type: String(s.type || 'other'),
    label: String(s.label || 'Recent signal'),
    detail: String(s.detail || ''),
    date: String(s.date || ''),
    strength: String(s.strength || 'medium'),
  })).filter((s: any) => s.detail) : []

  return {
    score: Math.min(100, Math.max(0, Number(parsed.score) || Math.min(55 + signals.length * 8 + (sources.length ? 5 : 0), 90))),
    summary: String(parsed.summary || (signals[0]?.detail ? signals[0].detail : `No strong recent public signal found for ${company}.`)),
    signals,
    sources,
  }
}

function extractInteractionSources(data: any) {
  const seen = new Set<string>()
  const sources: { title: string; url: string }[] = []

  // Interactions API returns Google Search citations as annotations on model
  // output text. Keep only unique URLs for the UI.
  const steps = Array.isArray(data?.steps) ? data.steps : []
  for (const step of steps) {
    const content = Array.isArray(step?.content) ? step.content : []
    for (const part of content) {
      const annotations = Array.isArray(part?.annotations) ? part.annotations : []
      for (const annotation of annotations) {
        if (annotation?.type !== 'url_citation') continue
        const url = String(annotation.url || '')
        if (!url || seen.has(url)) continue
        seen.add(url)
        sources.push({
          title: String(annotation.title || 'Source'),
          url,
        })
        if (sources.length >= 8) return sources
      }
    }
  }

  return sources
}
