import { NextResponse } from 'next/server'
import { supabaseAdmin, ensureImportBucket } from '@/lib/supabase-server'
import { importCsvText } from '@/lib/importer'
export const runtime='nodejs'
export const maxDuration=60
export async function POST(req:Request){
 try{
  const {userId,path,fileName}=await req.json()
  if(!userId||!path||!fileName) return NextResponse.json({error:'userId, path and fileName are required.'},{status:400})
  const supabase=supabaseAdmin(); await ensureImportBucket(supabase)
  const {data,error}=await supabase.storage.from('reachout-imports').download(path)
  if(error) throw new Error(`Could not download uploaded file: ${error.message}`)
  const result=await importCsvText(supabase,String(userId),String(fileName),await data.text(),String(path))
  return NextResponse.json({ok:true,...result})
 }catch(e){console.error('IMPORT_PROCESS_ERROR',e);return NextResponse.json({error:e instanceof Error?e.message:'Could not process file.'},{status:500})}
}
