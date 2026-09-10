import { NextResponse } from 'next/server'
import { authenticatedUser } from '@/lib/supabase-server'
export const runtime='nodejs'
const MODEL=process.env.GROQ_MODEL||'openai/gpt-oss-20b'
const schema=`Return JSON only with this shape: {"action":"navigate|select|generate|contact|followup|search|import|none","tab":"Home|Opportunities|Outreach|Follow-ups|null","person":"full name or null","query":"search text or null","reply":"short spoken confirmation"}. Never invent a person. Use action contact only when the user explicitly asks to mark reach out/contacted/complete. Use followup only when explicitly asking to mark a follow-up complete. For opening or viewing a person, use select. For navigation, use navigate. Use generate when the user asks to generate, draft, or write a message for a specific person. When the user asks who they should follow up with next, choose the best person from the supplied followups array using context such as overdue age, previous replies, and relevance; use action generate and set person to that person's full name. If followups is empty, inspect people for someone awaiting a reply (outgoing_count > 0 and no incoming reply) and choose the strongest candidate. Never say no contact is found merely because the exact phrase was not a navigation command.`
export async function POST(req:Request){
 try{
  await authenticatedUser(req); const key=process.env.GROQ_API_KEY
  if(!key)return NextResponse.json({error:'Groq is not configured yet.'},{status:503})
  const {command,people,followups,followupCount,recentContext}=await req.json()
  const compact=Array.isArray(people)?people.slice(0,120):[]
  const due=Array.isArray(followups)?followups.slice(0,60):[]
  const context=Array.isArray(recentContext)?recentContext.slice(-60):[]
  const prompt=`You control the ReachOut web app by voice. Interpret the user's command using the current app state, not just keywords. Current follow-ups due: ${Number(followupCount||0)}. Follow-up candidates: ${JSON.stringify(due)}. People available: ${JSON.stringify(compact)}. Recent conversation context: ${JSON.stringify(context)}.\n\nUser said: ${String(command||'')}\n\n${schema}`
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:MODEL,temperature:.1,max_completion_tokens:500,reasoning_effort:'low',include_reasoning:false,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a context-aware action agent for ReachOut. '+schema},{role:'user',content:prompt}]})})
  const data=await response.json().catch(()=>({})); if(!response.ok)return NextResponse.json({error:data?.error?.message||`Groq request failed (${response.status}).`},{status:502})
  const raw=data?.choices?.[0]?.message?.content; const parsed=typeof raw==='string'?JSON.parse(raw):raw
  return NextResponse.json(parsed)
 }catch(e){console.error('VOICE_ROUTE_ERROR',e);return NextResponse.json({error:e instanceof Error?e.message:'Could not understand that command.'},{status:500})}
}
