import { NextResponse } from 'next/server'
import { authenticatedUser } from '@/lib/supabase-server'

export const runtime='nodejs'
const MODEL=process.env.GROQ_MODEL||'openai/gpt-oss-20b'

export async function POST(req:Request){
 try{
  await authenticatedUser(req)
  const key=process.env.GROQ_API_KEY
  if(!key)return NextResponse.json({error:'Groq is not configured yet. Add GROQ_API_KEY in Vercel Environment Variables.'},{status:503})
  const body=await req.json()
  const {command,target,ownerName,profile,people,followups}=body||{}
  const candidates=Array.isArray(people)?people.slice(0,80):[]
  const fups=Array.isArray(followups)?followups.slice(0,40):[]
  const system=`You are the ReachOut Outreach Agent. You are a planning and prioritization agent for a LinkedIn outreach workspace. Decide the best next actions from supplied data only. Never invent facts. Do not claim to have accessed LinkedIn or sent anything. Return ONLY valid JSON with keys: reply (string), actions (array). Each action must have name, action ("draft","followup","research","skip"), reason, priority (1-5). Prefer a small focused queue of up to 5 actions.`
  const prompt=`User command: ${command||'Create my best outreach plan'}
Target role: ${target||''}
Owner: ${ownerName||''}
Profile: ${JSON.stringify(profile||{})}
People: ${JSON.stringify(candidates)}
Follow-ups: ${JSON.stringify(fups)}
Choose the highest-value actions. For draft/followup actions, use the exact person's full name from the supplied people/followups.`
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
   body:JSON.stringify({model:MODEL,temperature:.25,max_completion_tokens:900,reasoning_effort:'low',include_reasoning:false,messages:[{role:'system',content:system},{role:'user',content:prompt}]})
  })
  const data=await response.json().catch(()=>({}))
  if(!response.ok)return NextResponse.json({error:data?.error?.message||`Groq request failed (${response.status}).`},{status:502})
  const raw=data?.choices?.[0]?.message?.content
  let parsed:any
  try{
   const text=typeof raw==='string'?raw.trim():''
   parsed=JSON.parse(text.replace(/^```json\s*/,'').replace(/\s*```$/,''))
  }catch{ return NextResponse.json({error:'The agent returned an invalid plan. Please try again.'},{status:502}) }
  if(!parsed||!Array.isArray(parsed.actions))return NextResponse.json({error:'The agent returned an incomplete plan.'},{status:502})
  return NextResponse.json({reply:String(parsed.reply||'I built a focused outreach plan.'),actions:parsed.actions.slice(0,5),model:MODEL})
 }catch(e){console.error('AGENT_ROUTE_ERROR',e);return NextResponse.json({error:e instanceof Error?e.message:'Could not run the outreach agent.'},{status:500})}
}
