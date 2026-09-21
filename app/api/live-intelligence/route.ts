import { NextResponse } from 'next/server'
import { authenticatedUser, supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SearchResult = {
  title?: string
  url?: string
  content?: string
  published_date?: string
  score?: number
}

type Signal = {
  type: 'hiring' | 'funding' | 'career' | 'company' | 'news'
  title: string
  why_now: string
  date?: string
}

const clean = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim()
const lower = (s: unknown) => clean(s).toLowerCase()

function classifyResult(result: SearchResult, person: any, target: string): Signal | null {
  const text = `${clean(result.title)} ${clean(result.content)}`
  const t = lower(text)
  const title = clean(result.title) || 'New signal'
  const role = clean(person.position) || target
  const company = clean(person.company)

  if (/\b(hiring|job opening|job openings|vacanc|recruiting|join our team|careers|open roles|open position|we're hiring)\b/i.test(t)) {
    return { type: 'hiring', title, why_now: `${company || 'Their company'} has recent hiring activity relevant to ${role || target}.`, date: result.published_date }
  }
  if (/\b(raised|raises|funding|funded|series [a-f]|seed round|investment|million|billion)\b/i.test(t)) {
    return { type: 'funding', title, why_now: `${company || 'Their company'} has a recent funding or investment signal that may create new opportunities.`, date: result.published_date }
  }
  if (/\b(promoted|promotion|appointed|joins? as|joined as|named .* as|new (chief|head|vp|director)|became|steps? into)\b/i.test(t)) {
    return { type: 'career', title, why_now: `${clean(person.first_name)} ${clean(person.last_name)} may have a recent career or leadership change.`, date: result.published_date }
  }
  if (/\b(launch|launched|launches|product|expansion|expands|partnership|acquisition|acquire|acquired|market|new office|new business)\b/i.test(t)) {
    return { type: 'company', title, why_now: `${company || 'Their company'} has a recent business or product development worth knowing before you reach out.`, date: result.published_date }
  }
  return { type: 'news', title, why_now: `Recent public news may give you a timely conversation starter with ${clean(person.first_name)} ${clean(person.last_name)}.`, date: result.published_date }
}

async function tavilySearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      topic: 'general',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Web search failed (${response.status}).`)
  const data = await response.json()
  return Array.isArray(data?.results) ? data.results : []
}

export async function GET(req: Request) {
  try {
    const user = await authenticatedUser(req)
    const supabase = supabaseAdmin()
    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30), 1), 30)

    const { data, error } = await supabase
      .from('live_signals')
      .select('*')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .order('last_checked_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)

    return NextResponse.json({ signals: data || [], configured: Boolean(process.env.TAVILY_API_KEY) })
  } catch (e) {
    console.error('LIVE_INTELLIGENCE_GET', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load live intelligence.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticatedUser(req)
    const body = await req.json().catch(() => ({}))
    const target = clean(body.target) || 'Product Manager'
    const keywords = clean(body.keywords)
    const maxPeople = Math.min(Math.max(Number(body.max_people || 20), 1), 30)
    const apiKey = process.env.TAVILY_API_KEY

    if (!apiKey) {
      return NextResponse.json({
        configured: false,
        error: 'Web intelligence is not configured yet. Add TAVILY_API_KEY to your Vercel environment variables.',
      }, { status: 503 })
    }

    const supabase = supabaseAdmin()
    const { data: people, error: peopleError } = await supabase
      .from('connections')
      .select('id,linkedin_url,first_name,last_name,company,position,connected_on')
      .eq('user_id', user.id)
      .not('company', 'is', null)
      .order('created_at', { ascending: false })
      .limit(maxPeople)
    if (peopleError) throw new Error(peopleError.message)

    let checked = 0
    let createdSignals = 0
    const errors: string[] = []

    // Search in small parallel batches so a refresh is fast enough for Vercel.
    for (let i = 0; i < (people || []).length; i += 5) {
      const batch = (people || []).slice(i, i + 5)
      const results = await Promise.all(batch.map(async (person: any) => {
        const name = clean(`${person.first_name} ${person.last_name}`)
        const company = clean(person.company)
        if (!name || !company) return { person, signals: [], sources: [], error: '' }
        try {
          const query = [`"${name}"`, `"${company}"`, target, keywords].filter(Boolean).join(' ')
          const searchResults = await tavilySearch(query, apiKey)
          const unique = new Map<string, { signal: Signal; source: any }>()
          for (const result of searchResults) {
            if (!result.url) continue
            const signal = classifyResult(result, person, target)
            if (!signal) continue
            const key = `${signal.type}:${signal.title.toLowerCase()}`
            if (!unique.has(key)) unique.set(key, { signal, source: { title: clean(result.title), url: result.url, published_date: result.published_date || null } })
          }
          const items = Array.from(unique.values()).slice(0, 4)
          return { person, signals: items.map(x => x.signal), sources: items.map(x => x.source), error: '' }
        } catch (e) {
          return { person, signals: [], sources: [], error: `${name}: ${e instanceof Error ? e.message : 'search failed'}` }
        }
      }))

      for (const result of results) {
        const person = result.person
        const signals = result.signals
        const sources = result.sources
        if (result.error) { errors.push(result.error); continue }
        const score = Math.min(100, signals.reduce((sum: number, signal: Signal) => sum + (signal.type === 'hiring' ? 35 : signal.type === 'funding' ? 30 : signal.type === 'career' ? 25 : signal.type === 'company' ? 18 : 10), 0))
        const summary = signals[0]?.why_now || 'No strong recent public signal found.'
        const { error: upsertError } = await supabase.from('live_signals').upsert({
          user_id: user.id,
          connection_id: person.id,
          linkedin_url: clean(person.linkedin_url),
          first_name: clean(person.first_name),
          last_name: clean(person.last_name),
          company: clean(person.company),
          position: clean(person.position),
          signals,
          score,
          summary,
          sources,
          source_count: sources.length,
          status: signals.length ? 'new' : 'checked',
          primary_type: signals[0]?.type || 'news',
          why_now: summary,
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,connection_id' })
        if (upsertError) errors.push(`${person.first_name} ${person.last_name}: ${upsertError.message}`)
        else { checked++; createdSignals += signals.length }
      }
    }

    const { data: signals, error: readError } = await supabase
      .from('live_signals')
      .select('*')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .order('last_checked_at', { ascending: false })
      .limit(50)
    if (readError) throw new Error(readError.message)

    return NextResponse.json({ configured: true, checked, createdSignals, signals: signals || [], errors: errors.slice(0, 5) })
  } catch (e) {
    console.error('LIVE_INTELLIGENCE_POST', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not refresh live intelligence.' }, { status: 500 })
  }
}
