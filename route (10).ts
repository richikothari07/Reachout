import { NextResponse } from 'next/server'
import { supabaseAdmin, ensureImportBucket } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function GET(){try{const s=supabaseAdmin();const [{data,error},{data:imports,error:ie}]=await Promise.all([s.from('connections').select('id').limit(1),s.from('imports').select('id').limit(1)]);if(error)throw new Error(error.message);if(ie)throw new Error(ie.message);await ensureImportBucket(s);return NextResponse.json({ok:true,db:true,bucket:true})}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Health check failed.'},{status:500})}}
