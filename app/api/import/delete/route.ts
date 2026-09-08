import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function DELETE(req:Request){
 try{
  const {userId,importId}=await req.json(); if(!userId||!importId)return NextResponse.json({error:'userId and importId are required.'},{status:400})
  const supabase=supabaseAdmin(); const {data:imp,error}=await supabase.from('imports').select('file_path').eq('id',importId).eq('user_id',userId).single(); if(error)throw error
  const {error:del}=await supabase.from('imports').delete().eq('id',importId).eq('user_id',userId); if(del)throw del
  if(imp?.file_path) await supabase.storage.from('reachout-imports').remove([imp.file_path])
  return NextResponse.json({ok:true})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not remove import.'},{status:500})}
}
