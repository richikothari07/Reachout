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

type JobPosting = {
  title: string
  url: string
  source: string
  published_date?: string | null
}

const clean = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim()
const lower = (s: unknown) => clean(s).toLowerCase()

const JOB_DOMAINS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workdayjobs.com', 'myworkdayjobs.com',
  'smartrecruiters.com', 'workable.com', 'jobvite.com', 'bamboohr.com', 'recruitee.com',
  'pinpointhq.com', 'teamtailor.com', 'icims.com', 'successfactors.com'
]

function looksLikeJobUrl(url: string) {
  const u = lower(url)
  return JOB_DOMAINS.some(d => u.includes(d)) || /\/(jobs?|careers?|positions?|openings?)(\/|[?#]|$)/i.test(u)
}

function roleMatches(text: string, target: string) {
  const t = lower(text)
  const role = lower(target)
  if (!role) return true
  const phrases = [role]
  if (role.includes('product manager')) phrases.push('product management', 'product lead', 'product owner', 'product manager')
  if (role.includes('software engineer')) phrases.push('software engineer', 'software developer', 'engineering')
  if (role.includes('growth')) phrases.push('growth manager', 'growth lead', 'growth')
  if (role.includes('investment analyst')) phrases.push('investment analyst', 'investment associate', 'investments')
  return phrases.some(x => t.includes(x))
}

function sourceName(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('greenhouse')) return 'Greenhouse'
    if (host.includes('lever')) return 'Lever'
    if (host.includes('ashby')) return 'Ashby'
    if (host.includes('workday')) return 'Workday'
    return host
  } catch { return 'Job posting' }
}

function extractJobs(results: SearchResult[], company: string, target: string): JobPosting[] {
  const seen = new Set<string>()
  const jobs: JobPosting[] = []
  for (const result of results) {
    const url = clean(result.url)
    const title = clean(result.title)
    const content = clean(result.content)
    if (!url || !title || !looksLikeJobUrl(url)) continue
    if (!roleMatches(`${title} ${content}`, target)) continue
    const key = url.toLowerCase().replace(/[?#].*$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    jobs.push({ title, url, source: sourceName(url), published_date: result.published_date || null })
    if (jobs.length >= 6) break
  }
  return jobs
}

async function tavilySearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        topic: 'general',
        max_results: 8,
        include_answer: false,
        include_raw_content: false,
      }),
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Web search failed (${response.status}).`)
    const data = await response.json()
    return Array.isArray(data?.results) ? data.results : []
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Web search timed out after 9 seconds.')
    throw error
  } finally { clearTimeout(timeout) }
}

function toCompanies(rows: any[]) {
  const map = new Map<string, any>()
  for (const row of rows || []) {
    const company = clean(row.company)
    if (!company) continue
    const key = lower(company)
    const jobs = Array.isArray(row.signals) ? row.signals.filter((s: any) => s?.type === 'hiring' && s?.url).map((s: any) => ({
      title: clean(s.title), url: clean(s.url), source: clean(s.source), published_date: s.date || null,
    })).filter((j: any) => j.url) : []
    if (!jobs.length) continue
    if (!map.has(key)) map.set(key, { id: row.id, company, connections: [], jobs: [], last_checked_at: row.last_checked_at })
    const item = map.get(key)
    const connection = { id: row.connection_id, first_name: clean(row.first_name), last_name: clean(row.last_name), position: clean(row.position), linkedin_url: clean(row.linkedin_url) }
    if (!item.connections.some((c: any) => c.id === connection.id)) item.connections.push(connection)
    for (const job of jobs) if (!item.jobs.some((j: any) => j.url === job.url)) item.jobs.push(job)
    if (Date.parse(row.last_checked_at || '') > Date.parse(item.last_checked_at || '')) item.last_checked_at = row.last_checked_at
  }
  return Array.from(map.values()).map(item => ({ ...item, jobs: item.jobs.slice(0, 8) })).sort((a, b) => b.jobs.length - a.jobs.length)
}

export async function GET(req: Request) {
  try {
    const user = await authenticatedUser(req)
    const supabase = supabaseAdmin()
    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30), 1), 30)
    const { data, error } = await supabase.from('live_signals').select('*').eq('user_id', user.id).order('score', { ascending: false }).order('last_checked_at', { ascending: false }).limit(limit)
    if (error) throw new Error(error.message)

    const companies = toCompanies(data || [])
    return NextResponse.json({ companies, configured: Boolean(process.env.TAVILY_API_KEY) })
  } catch (e) {
    console.error('LIVE_INTELLIGENCE_GET', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load hiring intelligence.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticatedUser(req)
    const body = await req.json().catch(() => ({}))
    const target = clean(body.target) || 'Product Manager'
    const maxPeople = Math.min(Math.max(Number(body.max_people || 5), 1), 5)
    const offset = Math.max(Number(body.offset || 0), 0)
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) return NextResponse.json({ configured: false, error: 'Add TAVILY_API_KEY to your Vercel environment variables.' }, { status: 503 })

    const supabase = supabaseAdmin()
    const { data: people, error: peopleError } = await supabase.from('connections')
      .select('id,linkedin_url,first_name,last_name,company,position,connected_on')
      .eq('user_id', user.id).not('company', 'is', null).order('created_at', { ascending: false }).range(offset, offset + maxPeople - 1)
    if (peopleError) throw new Error(peopleError.message)

    let checked = 0
    let companiesFound = 0
    const errors: string[] = []

    const results = await Promise.all((people || []).map(async (person: any) => {
      const name = clean(`${person.first_name} ${person.last_name}`)
      const company = clean(person.company)
      if (!company) return { person, jobs: [], error: '' }
      try {
        const query = `"${company}" "${target}" jobs careers hiring`
        let searchResults = await tavilySearch(query, apiKey)
        let jobs = extractJobs(searchResults, company, target)
        if (!jobs.length) {
          searchResults = await tavilySearch(`"${company}" "${target}" careers jobs`, apiKey)
          jobs = extractJobs(searchResults, company, target)
        }
        return { person, jobs, error: '' }
      } catch (e) {
        return { person, jobs: [], error: `${name || company}: ${e instanceof Error ? e.message : 'search failed'}` }
      }
    }))

    for (const result of results) {
      const person = result.person
      if (result.error) { errors.push(result.error); continue }
      checked++
      if (!result.jobs.length) continue
      companiesFound += 1
      const signals = result.jobs.map(job => ({
        type: 'hiring',
        title: job.title,
        why_now: `${clean(person.company)} is hiring for ${job.title}. This is directly relevant to your ${target} goal.`,
        date: job.published_date || undefined,
        url: job.url,
        source: job.source,
      }))
      const sources = result.jobs.map(job => ({ title: job.title, url: job.url, published_date: job.published_date || null }))
      const score = Math.min(100, 60 + result.jobs.length * 8)
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
        summary: `${clean(person.company)} is hiring for ${result.jobs.length} relevant role${result.jobs.length === 1 ? '' : 's'}.`,
        sources,
        source_count: sources.length,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,connection_id' })
      if (upsertError) errors.push(`${person.first_name} ${person.last_name}: ${upsertError.message}`)
    }

    const { data: rows, error: readError } = await supabase.from('live_signals').select('*').eq('user_id', user.id).order('score', { ascending: false }).order('last_checked_at', { ascending: false }).limit(50)
    if (readError) throw new Error(readError.message)
    const companies = toCompanies(rows || [])
    return NextResponse.json({ configured: true, checked, companiesFound, companies, errors: errors.slice(0, 5), offset, nextOffset: (people || []).length < maxPeople ? 0 : offset + maxPeople, hasPeople: (people || []).length > 0 })
  } catch (e) {
    console.error('LIVE_INTELLIGENCE_POST', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not refresh hiring intelligence.' }, { status: 500 })
  }
}
