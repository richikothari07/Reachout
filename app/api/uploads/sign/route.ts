import { NextResponse } from 'next/server'
import { supabaseAdmin, ensureImportBucket } from '@/lib/supabase-server'
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { userId, fileName } = await req.json()
    if (!userId || !fileName) return NextResponse.json({ error: 'userId and fileName are required.' }, { status: 400 })
    const safe = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${userId}/${crypto.randomUUID()}-${safe}`
    const supabase = supabaseAdmin()
    await ensureImportBucket(supabase)
    const { data, error } = await supabase.storage.from('reachout-imports').createSignedUploadUrl(path)
    if (error) throw error
    return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl })
  } catch (e) {
    console.error('Signed upload error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not create upload URL.' }, { status: 500 })
  }
}
