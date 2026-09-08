import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function GET(req:Request){
  try{
    const u=new URL(req.url); const userId=u.searchParams.get('userId'); const linkedinUrl=u.searchParams.get('linkedinUrl')||''
    if(!userId||!linkedinUrl) return NextResponse.json({error:'userId and linkedinUrl are required.'},{status:400})
    const supabase=supabaseAdmin()
    const [a,b]=await Promise.all([
      supabase.from('messages').select('sender_name,sender_url,recipient_name,recipient_urls,message_date,content,folder').eq('user_id',userId).eq('sender_url',linkedinUrl).limit(50),
      supabase.from('messages').select('sender_name,sender_url,recipient_name,recipient_urls,message_date,content,folder').eq('user_id',userId).eq('recipient_urls',linkedinUrl).limit(50)
    ])
    if(a.error)throw a.error;if(b.error)throw b.error
    const seen=new Set<string>(); const data=[...(a.data||[]),...(b.data||[])].filter((m:any)=>{const k=`${m.message_date}|${m.sender_name}|${m.recipient_name}|${m.content}`;if(seen.has(k))return false;seen.add(k);return true}).sort((x:any,y:any)=>Date.parse(y.message_date)-Date.parse(x.message_date)).slice(0,50)
    return NextResponse.json({messages:data.map((m:any)=>({from:m.sender_name,sender:m.sender_url,to:m.recipient_name,recipient:m.recipient_urls,date:m.message_date,content:m.content,folder:m.folder}))})
  }catch(e){ return NextResponse.json({error:e instanceof Error?e.message:'Could not load messages.'},{status:500}) }
}
