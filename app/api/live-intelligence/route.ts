import { NextResponse } from 'next/server'
import { authenticatedUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SearchResult = { title?: string; url?: string; content?: string; published_date?: string; score?: number }
type HiringPost = { id:string; company:string; role:string; url:string; source:string; snippet:string; published_date?:string|null; relevance:number }

const clean=(s:unknown)=>String(s||'').replace(/\s+/g,' ').trim()
const lower=(s:unknown)=>clean(s).toLowerCase()

function isHiringPost(url:string){
  const u=lower(url)
  return u.includes('linkedin.com/posts/') || u.includes('linkedin.com/feed/update/') || u.includes('x.com/') || u.includes('twitter.com/') || /\/(post|posts|news|announcement|announcements|blog)\//i.test(u)
}
function sourceName(url:string){
  try{
    const host=new URL(url).hostname.replace(/^www\./,'').toLowerCase()
    if(host.includes('linkedin.com')) return 'LinkedIn'
    if(host.includes('x.com')||host.includes('twitter.com')) return 'X'
    return host
  }catch{return 'Web'}
}
function roleMatches(text:string,target:string){
  const t=lower(text), r=lower(target)
  if(!r)return true
  const aliases=r.includes('product manager')?['product manager','product management','pm role','product roles','product team']:[r]
  return aliases.some(x=>t.includes(x))
}
function locationMatches(text:string,location:string){
  const loc=lower(location)
  if(!loc||loc==='anywhere')return true
  const t=lower(text)
  if(loc==='remote')return /\bremote\b|work from anywhere|distributed/i.test(t)
  const aliases:Record<string,string[]>={mumbai:['mumbai','bombay'],bangalore:['bangalore','bengaluru'],bengaluru:['bangalore','bengaluru'],delhi:['delhi','new delhi','gurugram','gurgaon','noida'],ncr:['delhi','new delhi','gurugram','gurgaon','noida'],hyderabad:['hyderabad'],pune:['pune'],chennai:['chennai'],india:['india'],london:['london','uk','united kingdom'],singapore:['singapore'],dubai:['dubai','uae']}
  return (aliases[loc]||[loc]).some(x=>t.includes(x))
}
function experienceMatches(text:string,exp:string){
  if(!exp||exp==='Any')return true
  const t=lower(text)
  const m=t.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)/i) || t.match(/(\d+)\s*\+\s*(?:years?|yrs?)/i)
  if(!m)return true
  const min=Number(m[1]), max=m[2]?Number(m[2]):99
  const wanted=exp.match(/(\d+)(?:-(\d+)|\+)/)
  if(!wanted)return true
  const wmin=Number(wanted[1]), wmax=wanted[2]?Number(wanted[2]):99
  return max>=wmin && min<=wmax
}
function companyFromResult(r:SearchResult){
  const title=clean(r.title), content=clean(r.content), url=clean(r.url)
  // LinkedIn search result titles commonly contain "Company | post text" or "Name on LinkedIn: ...".
  const patterns=[
    /^(.*?)\s+(?:on LinkedIn|\| LinkedIn)/i,
    /^(.*?)\s+[|–—-]\s+(?:hiring|we're hiring|were hiring)/i,
    /(?:at|from)\s+([A-Z][A-Za-z0-9&.\- ]{2,60})/i
  ]
  for(const re of patterns){const m=title.match(re);if(m?.[1]&&m[1].length<80)return clean(m[1])}
  const contentMatch=content.match(/(?:we're|we are|were|from)\s+([A-Z][A-Za-z0-9&.\- ]{2,60})\s+(?:hiring|looking for|building)/i)
  if(contentMatch?.[1])return clean(contentMatch[1])
  try{
    const host=new URL(url).hostname.replace(/^www\./,'').split('.')[0]
    if(host && !['linkedin','twitter','x'].includes(host))return host.replace(/[-_]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase())
  }catch{}
  return 'Company'
}
function extractPosts(results:SearchResult[],target:string,location:string,experience:string){
  const seen=new Set<string>(), posts:HiringPost[]=[]
  for(const r of results){
    const url=clean(r.url), title=clean(r.title), content=clean(r.content), text=`${title} ${content}`
    if(!url||!title||!isHiringPost(url))continue
    if(!/\bhiring\b|\bwe're hiring\b|\bwe are hiring\b|\bjoin our team\b|\blooking for\b|\bopen roles?\b|\bjob opening/i.test(text))continue
    if(!roleMatches(text,target)||!locationMatches(text,location)||!experienceMatches(text,experience))continue
    const key=url.toLowerCase().replace(/[?#].*$/,'')
    if(seen.has(key))continue
    seen.add(key)
    const roleMatch=text.match(/(?:hiring|looking for|seeking|join us as)\s+(?:a|an)?\s*([^.!\n]{3,100})/i)
    const role=roleMatch?.[1]?clean(roleMatch[1]).replace(/\b(?:in|at)\s+(?:our|the)\b.*$/i,'').trim():target
    const relevance=Math.min(100,60+(roleMatches(text,target)?20:0)+(locationMatches(text,location)?10:0)+(experienceMatches(text,experience)?10:0)+(sourceName(url)==='LinkedIn'?10:0))
    posts.push({id:key,company:companyFromResult(r),role:role||target,url,source:sourceName(url),snippet:clean(content).slice(0,220),published_date:r.published_date||null,relevance})
  }
  return posts.sort((a,b)=>b.relevance-a.relevance).slice(0,30)
}
async function search(query:string,apiKey:string){
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),10000)
  try{
    const res=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:apiKey,query,search_depth:'advanced',topic:'general',max_results:10,include_answer:false,include_raw_content:false}),cache:'no-store',signal:controller.signal})
    if(!res.ok)throw new Error(`Web search failed (${res.status}).`)
    const d=await res.json();return Array.isArray(d?.results)?d.results:[]
  }finally{clearTimeout(timeout)}
}

export async function GET(req:Request){
  try{await authenticatedUser(req);return NextResponse.json({configured:Boolean(process.env.TAVILY_API_KEY)})}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not load hiring intelligence.'},{status:500})}
}

export async function POST(req:Request){
  try{
    await authenticatedUser(req)
    const body=await req.json().catch(()=>({}))
    const target=clean(body.target)||'Product Manager', location=clean(body.location)||'Anywhere', experience=clean(body.experience)||'Any'
    const apiKey=process.env.TAVILY_API_KEY
    if(!apiKey)return NextResponse.json({configured:false,error:'Add TAVILY_API_KEY to your Vercel environment variables.'},{status:503})
    const loc=location==='Anywhere'?'':` "${location}"`
    const exp=experience==='Any'?'':` "${experience}"`
    // We are deliberately searching for PUBLIC HIRING POSTS, not job-board listings.
    const queries=[
      `site:linkedin.com/posts (hiring OR "we're hiring" OR "we are hiring" OR "join our team") "${target}"${loc}${exp}`,
      `site:linkedin.com/posts "${target}" (hiring OR "open role" OR "join our team")${loc}`,
      `site:linkedin.com/feed/update "${target}" hiring${loc}`,
      `site:x.com "${target}" (hiring OR "we're hiring")${loc}`,
      `"${target}" ("we're hiring" OR "we are hiring" OR "join our team")${loc}${exp}`
    ]
    const settled=await Promise.allSettled(queries.map(q=>search(q,apiKey)))
    const errors=settled.filter(x=>x.status==='rejected').map(x=>x.reason instanceof Error?x.reason.message:'Search failed')
    const all=settled.flatMap(x=>x.status==='fulfilled'?x.value:[])
    const posts=extractPosts(all,target,location,experience)
    const grouped=new Map<string,{company:string;posts:HiringPost[];last_checked_at:string}>()
    for(const post of posts){const key=lower(post.company);const x=grouped.get(key);if(x)x.posts.push(post);else grouped.set(key,{company:post.company,posts:[post],last_checked_at:new Date().toISOString()})}
    const companies=Array.from(grouped.values()).map(x=>({...x,posts:x.posts.slice(0,4)}))
    return NextResponse.json({configured:true,checked:all.length,postCount:posts.length,companies,errors:errors.slice(0,3),filters:{target,location,experience}})
  }catch(e){console.error('LIVE_INTELLIGENCE_POST',e);return NextResponse.json({error:e instanceof Error?e.message:'Could not search hiring posts.'},{status:500})}
}
