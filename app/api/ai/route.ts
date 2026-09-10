import { NextResponse } from 'next/server'
import { authenticatedUser } from '@/lib/supabase-server'
export const runtime='nodejs'
const MODEL=process.env.GROQ_MODEL||'openai/gpt-oss-20b'
export async function POST(req:Request){
 try{
  await authenticatedUser(req)
  const key=process.env.GROQ_API_KEY
  if(!key)return NextResponse.json({error:'Groq is not configured yet. Add GROQ_API_KEY in Vercel Environment Variables.'},{status:503})
  const body=await req.json(); const {mode,target,ownerName,profile,person,conversation}=body||{}
  if(!person?.first_name)return NextResponse.json({error:'Person details are required.'},{status:400})
  const safeConversation=Array.isArray(conversation)?conversation.slice(-12).map((m:any)=>({from:String(m.from||''),date:String(m.date||''),content:String(m.content||'').slice(0,800)})):[]
  const system='You are ReachOut, a concise LinkedIn outreach copilot. Write natural, human-sounding messages that do not feel automated, salesy, desperate, or overly flattering. Never invent facts. Use only supplied context. Do not mention a match score or say AI recommended the person. Keep first outreach 45-80 words and follow-ups 35-65 words. No hashtags. Return only the message text, with no quotation marks or explanation.'
  const context={mode:mode==='followup'?'follow-up':'first outreach',target:target||'',ownerName:ownerName||'',userProfile:profile||{},person:{name:`${person.first_name||''} ${person.last_name||''}`.trim(),position:person.position||'',company:person.company||'',reasons:Array.isArray(person.reasons)?person.reasons.slice(0,5):[]},conversation:safeConversation}
  const prompt=mode==='followup'?`Write a polite follow-up to the last message the user sent. Do not repeat the entire original message. Add one useful reason to reconnect if supported. If there is no usable history, do not falsely claim a previous message. Context:\n${JSON.stringify(context)}`:`Write a personalized first LinkedIn outreach message. Mention one specific supported reason for contacting this person and make the ask lightweight (connect, learn, or brief chat). Do not make it sound like a job application unless supported. Context:\n${JSON.stringify(context)}`
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:MODEL,temperature:.65,max_tokens:220,messages:[{role:'system',content:system},{role:'user',content:prompt}]})})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)return NextResponse.json({error:data?.error?.message||`Groq request failed (${response.status}).`},{status:502})
  const text=String(data?.choices?.[0]?.message?.content||'').trim()
  if(!text)return NextResponse.json({error:'Groq returned an empty message. Please try again.'},{status:502})
  return NextResponse.json({message:text,model:MODEL})
 }catch(e){console.error('AI_ROUTE_ERROR',e);return NextResponse.json({error:e instanceof Error?e.message:'Could not generate the message.'},{status:500})}
}
