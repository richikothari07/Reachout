import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { authenticatedUser, supabaseAdmin, ensureImportBucket } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function POST(req:Request){try{const user=await authenticatedUser(req);const {fileName}=await req.json();if(!fileName)return NextResponse.json({error:'fileName is required.'},{status:400});const s=supabaseAdmin();await ensureImportBucket(s);const safe=String(fileName).replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${user.id}/${crypto.randomUUID()}-${safe}`;const {data,error}=await s.storage.from('reachout-imports').createSignedUploadUrl(path);if(error)throw new Error(`Could not create signed upload URL: ${error.message}`);return NextResponse.json({signedUrl:data.signedUrl,path})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not prepare upload.'},{status:401})}}
