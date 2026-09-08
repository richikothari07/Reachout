import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function DELETE(req:Request){
  try{
    const {userId}=await req.json(); if(!userId) return NextResponse.json({error:'userId is required.'},{status:400})
    const supabase=supabaseAdmin()
    await supabase.from('messages').delete().eq('user_id',userId)
    await supabase.from('connections').delete().eq('user_id',userId)
    const {data:imports}=await supabase.from('imports').select('file_path').eq('user_id',userId)
    if(imports?.length) await supabase.storage.from('reachout-imports').remove(imports.map((x:any)=>x.file_path))
    await supabase.from('imports').delete().eq('user_id',userId)
    return NextResponse.json({ok:true})
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not reset data.'},{status:500})}
}
