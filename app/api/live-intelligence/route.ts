import { NextResponse } from 'next/server'
import { authenticatedUser, supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SearchResult = { title?: string; url?: string; content?: string; published_date?: string; score?: number }
type HiringJob = {
  id: string
  company: string
  title: string
  url: string
  source: string
  location: string
  experience: string
  published_date?: string | null
  relevance: number
}

const clean = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim()
const lower = (s: unknown) => clean(s).toLowerCase()

const ATS_DOMAINS = ['greenhouse.io','lever.co','ashbyhq.com','workdayjobs.com','myworkdayjobs.com','smartrecruiters.com','workable.com','jobvite.com','bamboohr.com','recruitee.com','pinpointhq.com','teamtailor.com','icims.com','successfactors.com']

function looksLikeJobUrl(url: string) {
  const u = lower(url)
  return ATS_DOMAINS.some(d => u.includes(d)) || /\/(jobs?|careers?|positions?|openings?|vacancies)(\/|[?#]|$)/i.test(u)
}
function sourceName(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./,'')
    const names: Record<string,string> = { 'greenhouse.io':'Greenhouse','lever.co':'Lever','ashbyhq.com':'Ashby','workdayjobs.com':'Workday','myworkdayjobs.com':'Workday','smartrecruiters.com':'SmartRecruiters','workable.com':'Workable','jobvite.com':'Jobvite','bamboohr.com':'BambooHR','recruitee.com':'Recruitee','teamtailor.com':'Teamtailor','icims.com':'iCIMS','successfactors.com':'SAP SuccessFactors' }
    return Object.entries(names).find(([d])=>host.includes(d))?.[1] || host
  } catch { return 'Job posting' }
}
function slugToName(slug: string) { return slug.replace(/[-_]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase()).trim() }
function companyFromResult(result: SearchResult) {
  const title = clean(result.title)
  const content = clean(result.content)
  const url = clean(result.url)
  // Common ATS URL patterns are more reliable than search-result titles.
  try {
    const u = new URL(url); const parts = u.pathname.split('/').filter(Boolean)
    const host = u.hostname.toLowerCase()
    if (host.includes('lever.co') && parts[0]) return slugToName(parts[0])
    if (host.includes('ashbyhq.com') && parts[0]) return slugToName(parts[0])
    if (host.includes('greenhouse.io') && parts[0] && !['job_board','embed'].includes(parts[0])) return slugToName(parts[0])
  } catch {}
  const titleParts = title.split(/\s+[|–—-]\s+/)
  if (titleParts.length > 1) {
    const candidate = titleParts[titleParts.length-1].trim()
    if (candidate && candidate.length < 70 && !/^(jobs?|careers?|apply|job opening)$/i.test(candidate)) return candidate
  }
  const at = content.match(/(?:at|with)\s+([A-Z][A-Za-z0-9&.\- ]{2,60})\s+(?:as|is|are|for|and)\b/)
  if (at?.[1]) return clean(at[1])
  try {
    const host = new URL(url).hostname.replace(/^www\./,'').split('.')[0]
    if (host && !ATS_DOMAINS.some(d=>host.includes(d))) return slugToName(host)
  } catch {}
  return 'Company'
}
function locationMatches(text: string, location: string) {
  const loc = lower(location)
  if (!loc || loc === 'anywhere') return true
  const t = lower(text)
  if (loc === 'remote') return /\bremote\b|work from anywhere|distributed/i.test(t)
  const aliases: Record<string,string[]> = { 'mumbai':['mumbai','bombay'], 'bangalore':['bangalore','bengaluru'], 'bengaluru':['bangalore','bengaluru'], 'delhi':['delhi','new delhi','gurugram','gurgaon','noida'], 'ncr':['delhi','new delhi','gurugram','gurgaon','noida'], 'hyderabad':['hyderabad'], 'pune':['pune'], 'chennai':['chennai'], 'india':['india'], 'london':['london','uk','united kingdom'], 'new york':['new york','nyc'], 'san francisco':['san francisco','bay area'] }
  const terms = aliases[loc] || [loc]
  return terms.some(x=>t.includes(x))
}
function experienceMatches(text: string, exp: string) {
  if (!exp || exp === 'Any') return { ok:true, confidence:1 }
  const t = lower(text)
  const ranges = exp.split('-').map(Number)
  const plusRange = exp.endsWith('+')
  const years = [...t.matchAll(/(?:at least\s+)?(\d+)\s*(?:-|to)?\s*(\d+)?\s*(?:years?|yrs?)/g)].map(m=>({min:Number(m[1]),max:m[2]?Number(m[2]):Number(m[1])}))
  const plus = t.match(/(\d+)\s*\+\s*(?:years?|yrs?)/); if (plus) years.push({min:Number(plus[1]),max:99})
  if (!years.length) return { ok:true, confidence:.45 }
  const [min] = ranges
  const max = plusRange ? 99 : ranges[1]
  return { ok: years.some(r=>r.max>=min && r.min<=max), confidence:1 }
}
function roleMatches(text: string, target: string) {
  const role = lower(target); const t = lower(text)
  if (!role) return true
  const aliases = role.includes('product manager') ? ['product manager','product management','product lead','product owner'] : role.includes('software engineer') ? ['software engineer','software developer','backend engineer','frontend engineer','full stack engineer'] : [role]
  return aliases.some(x=>t.includes(x))
}
function extractJobs(results: SearchResult[], target: string, location: string, experience: string): HiringJob[] {
  const seen = new Set<string>(); const jobs: HiringJob[] = []
  for (const r of results) {
    const url = clean(r.url), title = clean(r.title), content = clean(r.content)
    if (!url || !title || !looksLikeJobUrl(url)) continue
    const text = `${title} ${content}`
    if (!roleMatches(text,target)) continue
    if (!locationMatches(text,location)) continue
    const exp = experienceMatches(text,experience); if (!exp.ok) continue
    const key = url.toLowerCase().replace(/[?#].*$/,'')
    if (seen.has(key)) continue; seen.add(key)
    const company = companyFromResult(r)
    const relevance = Math.round(Math.min(100, 55 + (roleMatches(text,target)?20:0) + (locationMatches(text,location)?15:0) + exp.confidence*10 + (ATS_DOMAINS.some(d=>lower(url).includes(d))?10:0)))
    jobs.push({ id:key, company, title, url, source:sourceName(url), location: location || 'Any location', experience: experience || 'Any', published_date:r.published_date||null, relevance })
  }
  return jobs.sort((a,b)=>b.relevance-a.relevance).slice(0,30)
}
async function tavilySearch(query:string,apiKey:string):Promise<SearchResult[]> {
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),9000)
  try {
    const response=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:apiKey,query,search_depth:'advanced',topic:'general',max_results:10,include_answer:false,include_raw_content:false}),cache:'no-store',signal:controller.signal})
    if(!response.ok)throw new Error(`Web search failed (${response.status}).`)
    const data=await response.json(); return Array.isArray(data?.results)?data.results:[]
  } catch(e) { if(e instanceof Error&&e.name==='AbortError')throw new Error('Web search timed out after 9 seconds.'); throw e }
  finally{clearTimeout(timeout)}
}

export async function GET(req:Request){
  try{
    await authenticatedUser(req)
    return NextResponse.json({configured:Boolean(process.env.TAVILY_API_KEY)})
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not load hiring intelligence.'},{status:500})}
}

export async function POST(req:Request){
  try{
    const user=await authenticatedUser(req); const body=await req.json().catch(()=>({}))
    const target=clean(body.target)||'Product Manager'; const location=clean(body.location)||'Anywhere'; const experience=clean(body.experience)||'Any'
    const apiKey=process.env.TAVILY_API_KEY
    if(!apiKey)return NextResponse.json({configured:false,error:'Add TAVILY_API_KEY to your Vercel environment variables.'},{status:503})
    const queries=[
      `"${target}" ${location==='Anywhere'?'':`"${location}"`} ${experience==='Any'?'':`"${experience}"`} jobs hiring careers`,
      `site:greenhouse.io "${target}" ${location==='Anywhere'?'':`"${location}"`}`,
      `site:jobs.ashbyhq.com "${target}" ${location==='Anywhere'?'':`"${location}"`}`,
      `site:lever.co "${target}" ${location==='Anywhere'?'':`"${location}"`}`,
      `"${target}" ${location==='Anywhere'?'':`"${location}"`} apply careers jobs`
    ]
    const settled=await Promise.allSettled(queries.map(q=>tavilySearch(q,apiKey)))
    const errors=settled.filter(x=>x.status==='rejected').map(x=>x.reason instanceof Error?x.reason.message:'Search failed')
    const all=settled.flatMap(x=>x.status==='fulfilled'?x.value:[])
    const jobs=extractJobs(all,target,location,experience)
    const grouped = new Map<string,{company:string;jobs:HiringJob[];last_checked_at:string}>()
    for (const job of jobs) {
      const key = lower(job.company)
      const existing = grouped.get(key)
      if (existing) existing.jobs.push(job)
      else grouped.set(key, { company: job.company, jobs: [job], last_checked_at: new Date().toISOString() })
    }
    const companies = Array.from(grouped.values()).map(x=>({...x,jobs:x.jobs.slice(0,6)}))
    return NextResponse.json({configured:true,checked:all.length,jobCount:jobs.length,companies,errors:errors.slice(0,3),filters:{target,location,experience}})
  }catch(e){console.error('LIVE_INTELLIGENCE_POST',e);return NextResponse.json({error:e instanceof Error?e.message:'Could not search hiring intelligence.'},{status:500})}
}
