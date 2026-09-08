import { NextResponse } from 'next/server'
import Papa from 'papaparse'
import { supabaseAdmin } from '@/lib/supabase-server'

export const runtime='nodejs'
export const maxDuration=60

function findHeader(text:string, matcher:(h:string[])=>boolean){
  const lines=text.split(/\r?\n/)
  for(let i=0;i<Math.min(lines.length,50);i++){
    const parsed=Papa.parse<string[]>(lines[i],{skipEmptyLines:false}).data?.[0]||[]
    const h=parsed.map(x=>String(x).trim())
    if(matcher(h)) return lines.slice(i).join('\n')
  }
  throw new Error('LinkedIn header not found.')
}
function guess(text:string,fileName:string){
  const n=fileName.toLowerCase()
  if(n.includes('message')) return 'messages'
  if(n.includes('connection')) return 'connections'
  if(text.includes('CONVERSATION ID')&&text.includes('CONTENT')) return 'messages'
  if(text.includes('First Name')&&text.includes('Last Name')&&text.includes('Company')) return 'connections'
  throw new Error('Could not identify this LinkedIn export.')
}

export async function POST(req:Request){
  let importId:string|undefined
  try{
    const {userId,path,fileName}=await req.json()
    if(!userId||!path||!fileName) return NextResponse.json({error:'userId, path and fileName are required.'},{status:400})
    const supabase=supabaseAdmin()
    const raw=await supabase.storage.from('reachout-imports').download(path)
    if(raw.error) throw raw.error
    const text=await raw.data.text()
    const type=guess(text,fileName)
    const {data:imp,error:impErr}=await supabase.from('imports').insert({user_id:userId,file_name:fileName,file_path:path,file_type:type,status:'processing'}).select('id').single()
    if(impErr) throw impErr
    importId=imp.id
    if(type==='connections'){
      const body=findHeader(text,h=>h.includes('First Name')&&h.includes('Last Name')&&h.includes('Company')&&h.includes('Position'))
      const parsed=Papa.parse<Record<string,string>>(body,{header:true,skipEmptyLines:true,transformHeader:h=>h.replace(/^\uFEFF/,'').trim()})
      const rows=parsed.data.map(x=>({user_id:userId,import_id:importId,linkedin_url:String(x.URL||'').trim(),dedupe_key:(String(x.URL||'').trim().toLowerCase()||`${String(x['First Name']||'').trim()}|${String(x['Last Name']||'').trim()}|${String(x.Company||'').trim()}`.toLowerCase()),first_name:String(x['First Name']||'').trim(),last_name:String(x['Last Name']||'').trim(),company:String(x.Company||'').trim(),position:String(x.Position||'').trim(),connected_on:String(x['Connected On']||'').trim()})).filter(x=>x.first_name||x.last_name)
      for(let i=0;i<rows.length;i+=500){ const {error}=await supabase.from('connections').upsert(rows.slice(i,i+500),{onConflict:'user_id,dedupe_key',ignoreDuplicates:true}); if(error) throw error }
      await supabase.from('imports').update({row_count:rows.length,status:'ready'}).eq('id',importId)
      return NextResponse.json({type,rows:rows.length})
    }
    const body=findHeader(text,h=>h.includes('CONVERSATION ID')&&h.includes('FROM')&&h.includes('TO')&&h.includes('CONTENT'))
    const parsed=Papa.parse<Record<string,string>>(body,{header:true,skipEmptyLines:true,transformHeader:h=>h.replace(/^\uFEFF/,'').trim()})
    const rows=parsed.data.map(x=>({user_id:userId,import_id:importId,conversation_id:String(x['CONVERSATION ID']||'').trim(),dedupe_key:`${String(x['CONVERSATION ID']||'').trim()}|${String(x.DATE||'').trim()}|${String(x.FROM||'').trim()}|${String(x.TO||'').trim()}|${String(x.CONTENT||'')}`.toLowerCase(),sender_name:String(x.FROM||'').trim(),sender_url:String(x['SENDER PROFILE URL']||'').trim(),recipient_name:String(x.TO||'').trim(),recipient_urls:String(x['RECIPIENT PROFILE URLS']||'').trim(),message_date:String(x.DATE||'').trim(),content:String(x.CONTENT||''),folder:String(x.FOLDER||'').trim()})).filter(x=>x.sender_name||x.recipient_name||x.content)
    for(let i=0;i<rows.length;i+=500){ const {error}=await supabase.from('messages').upsert(rows.slice(i,i+500),{onConflict:'user_id,dedupe_key',ignoreDuplicates:true}); if(error) throw error }
    await supabase.from('imports').update({row_count:rows.length,status:'ready'}).eq('id',importId)
    return NextResponse.json({type,rows:rows.length})
  }catch(e){
    if(importId) { try { await supabaseAdmin().from('imports').update({status:'error',error:e instanceof Error?e.message:'Import failed'}).eq('id',importId) } catch {} }
    return NextResponse.json({error:e instanceof Error?e.message:'Import failed.'},{status:500})
  }
}
