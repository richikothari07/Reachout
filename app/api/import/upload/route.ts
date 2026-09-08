import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin, ensureImportBucket } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const userId = String(form.get('userId') || '')
    const file = form.get('file')
    if (!userId || !(file instanceof File)) {
      return NextResponse.json({ error: 'userId and file are required.' }, { status: 400 })
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'FILE_TOO_LARGE', useSignedUpload: true }, { status: 413 })
    }

    const supabase = supabaseAdmin()
    await ensureImportBucket(supabase)

    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${userId}/${crypto.randomUUID()}-${safe}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error } = await supabase.storage.from('reachout-imports').upload(path, bytes, {
      contentType: file.type || 'text/csv', upsert: false,
    })
    if (error) throw error

    const origin = new URL(req.url).origin
    const processResponse = await fetch(`${origin}/api/import/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, path, fileName: file.name }),
      cache: 'no-store',
    })
    const result = await processResponse.json()
    if (!processResponse.ok) throw new Error(result.error || 'Import processing failed.')
    return NextResponse.json(result)
  } catch (e) {
    console.error('Backend upload error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not upload data.' }, { status: 500 })
  }
}
