import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin, ensureImportBucket } from '@/lib/supabase-server'
import { importCsvText } from '@/lib/importer'

export const runtime='nodejs'
export const maxDuration=60

export async function POST(req:Request){
  try{
    const form=await req.formData()
    const userId=String(form.get('userId')||'').trim()
    const file=form.get('file')
    if(!userId || !(file instanceof File)) return NextResponse.json({error:'userId and file are required.'},{status:400})
    if(!file.name.toLowerCase().endsWith('.csv')) return NextResponse.json({error:'Please upload a CSV file.'},{status:400})
    if(file.size>4*1024*1024) return NextResponse.json({error:'FILE_TOO_LARGE',useSignedUpload:true},{status:413})
    const supabase=supabaseAdmin()
    await ensureImportBucket(supabase)
    const text=await file.text()
    // Parse + persist directly. This avoids an unnecessary server-to-server HTTP hop.
    const result=await importCsvText(supabase,userId,file.name,text)
    return NextResponse.json({ok:true,...result})
  }catch(e){
    console.error('IMPORT_UPLOAD_ERROR',e)
    return NextResponse.json({error:e instanceof Error?e.message:'Could not import file.'},{status:500})
  }
}
