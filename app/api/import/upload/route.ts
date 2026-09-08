import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { importCsvText } from '@/lib/importer'

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

    // Normal LinkedIn exports are comfortably below this limit. Process them
    // directly here so importing does not depend on Supabase Storage.
    if (file.size <= 4 * 1024 * 1024) {
      const supabase = supabaseAdmin()
      const text = await file.text()
      const result = await importCsvText(supabase, userId, file.name, text, null)
      return NextResponse.json(result)
    }

    // Larger exports use the signed-upload path handled by the frontend.
    return NextResponse.json({ error: 'FILE_TOO_LARGE', useSignedUpload: true }, { status: 413 })
  } catch (e) {
    console.error('Backend upload error:', e)
    const message = e instanceof Error ? e.message : 'Could not import data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
