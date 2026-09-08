import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin, ensureImportBucket } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function POST(req:Request){
 try{
  const {userId,fileName}=await req.json(); if(!userId||!fileName) return NextResponse.json({error:'userId and fileName are required.'},{status:400})
  const supabase=supabaseAdmin(); await ensureImportBucket(supabase)
  const safe=String(fileName).replace(/[^a-zA-Z0-9._-]/g,'_'); const path=`${userId}/${crypto.randomUUID()}-${safe}`
  const {data,error}=await supabase.storage.from('reachout-imports').createSignedUploadUrl(path)
  if(error) throw new Error(`Could not create signed upload URL: ${error.message}`)
  return NextResponse.json({signedUrl:data.signedUrl,path})
 }catch(e){console.error('SIGN_UPLOAD_ERROR',e);return NextResponse.json({error:e instanceof Error?e.message:'Could not prepare upload.'},{status:500})}
}
