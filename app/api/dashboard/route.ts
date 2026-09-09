import { NextResponse } from 'next/server'
import { authenticatedUser, supabaseAdmin } from '@/lib/supabase-server'
import { classify, dateMs } from '@/lib/shared'
export const runtime='nodejs'

async function allRows(client:any, table:string, userId:string, columns:string){
 let out:any[]=[]; let from=0
 while(true){
  const {data,error}=await client.from(table).select(columns).eq('user_id',userId).range(from,from+999)
  if(error) throw new Error(`Could not load ${table}: ${error.message}`)
  out.push(...(data||[])); if(!data||data.length<1000) break; from+=1000
  if(from>100000) break
 }
 return out
}
function key(s=''){return s.toLowerCase().trim()}
export async function GET(req:Request){
 try{
  const u=new URL(req.url); const user=await authenticatedUser(req); const userId=user.id; const target=u.searchParams.get('target')||'Product Manager'; const keywords=u.searchParams.get('keywords')||''; let profile:any={}; try{profile=JSON.parse(u.searchParams.get('profile')||'{}')}catch{}
  const supabase=supabaseAdmin()
  const [connections,messages,imports]=await Promise.all([
   allRows(supabase,'connections',userId,'first_name,last_name,linkedin_url,company,position,connected_on,education'),
   allRows(supabase,'messages',userId,'sender_name,sender_url,recipient_name,recipient_urls,message_date,content,folder'),
   allRows(supabase,'imports',userId,'id,file_name,file_type,row_count,status,error,created_at')
  ])
  const stats=new Map<string,{contact_url:string;contact_name:string;outgoing_count:number;incoming_count:number;last_outgoing:string|null;last_incoming:string|null}>()
  const owner=key(u.searchParams.get('ownerName')||'')
  const ensure=(url:string,name:string)=>{const k=key(url)||key(name);if(!stats.has(k))stats.set(k,{contact_url:url,contact_name:name,outgoing_count:0,incoming_count:0,last_outgoing:null,last_incoming:null});return stats.get(k)!}
  for(const m of messages){
   const from=String(m.sender_name||''); const to=String(m.recipient_name||''); const senderUrl=String(m.sender_url||''); const recipientUrls=String(m.recipient_urls||'')
   const mine=owner && key(from)===owner
   const contactName=mine?to:from; const contactUrl=mine?recipientUrls:senderUrl
   if(!contactName && !contactUrl) continue
   const s=ensure(contactUrl,contactName); const d=String(m.message_date||'')
   if(mine){s.outgoing_count++;if(!s.last_outgoing||dateMs(d)>dateMs(s.last_outgoing))s.last_outgoing=d}
   else {s.incoming_count++;if(!s.last_incoming||dateMs(d)>dateMs(s.last_incoming))s.last_incoming=d}
  }
  const people=connections.map((c:any)=>classify(c,target,stats.get(key(c.linkedin_url))||stats.get(key(`${c.first_name} ${c.last_name}`)),keywords,profile)).sort((a:any,b:any)=>b.score-a.score)
  return NextResponse.json({connectionsCount:connections.length,messagesCount:messages.length,companiesCount:new Set(connections.map((x:any)=>x.company).filter(Boolean)).size,people,imports})
 }catch(e){console.error('DASHBOARD_ERROR',e);return NextResponse.json({error:e instanceof Error?e.message:'Could not load dashboard.'},{status:500})}
}
