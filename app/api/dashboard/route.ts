import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { classify, Connection, MessageStats } from '@/lib/shared'

export const runtime='nodejs'

export async function GET(req:Request){
  try{
    const url=new URL(req.url); const userId=url.searchParams.get('userId'); const ownerName=url.searchParams.get('ownerName')||'Richi Kothari'; const target=url.searchParams.get('target')||'Product Manager'; const days=Number(url.searchParams.get('days')||7)
    if(!userId) return NextResponse.json({error:'userId is required.'},{status:400})
    const supabase=supabaseAdmin()
    const [{data:connections,error:cErr},{data:stats,error:sErr},{data:imports,error:iErr},{count:messagesCount,error:mErr}]=await Promise.all([
      supabase.from('connections').select('first_name,last_name,linkedin_url,company,position,connected_on').eq('user_id',userId).limit(50000),
      supabase.rpc('get_message_stats',{p_user_id:userId,p_owner_name:ownerName}),
      supabase.from('imports').select('id,file_name,file_type,row_count,status,error,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100),
      supabase.from('messages').select('id',{count:'exact',head:true}).eq('user_id',userId)
    ])
    if(cErr) throw cErr; if(sErr) throw sErr; if(iErr) throw iErr; if(mErr) throw mErr
    const statsMap=new Map<string,MessageStats>((stats||[]).map((s:any)=>[String(s.contact_url).toLowerCase(),s]))
    const ranked=(connections||[]).map((c:any)=>classify(c as Connection,target,statsMap.get(String(c.linkedin_url||'').toLowerCase()))).sort((a:any,b:any)=>b.score-a.score)
    const followups=ranked.filter((p:any)=>p.action==='Follow up' && p.lastOutgoing && (Date.now()-Date.parse(p.lastOutgoing.replace(' UTC','Z')))/86400000>=days)
    return NextResponse.json({connectionsCount:connections?.length||0,messagesCount:messagesCount||0,imports,people:ranked.slice(0,5000),recommended:ranked.filter((p:any)=>p.action==='Reach out').slice(0,10),followups:followups.slice(0,100)})
  }catch(e){ return NextResponse.json({error:e instanceof Error?e.message:'Could not load dashboard.'},{status:500}) }
}
