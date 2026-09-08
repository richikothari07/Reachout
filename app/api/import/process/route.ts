import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { importCsvText } from '@/lib/importer'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { userId, path, fileName } = await req.json()
    if (!userId || !path || !fileName) {
      return NextResponse.json({ error: 'userId, path and fileName are required.' }, { status: 400 })
    }

    const supabase = supabaseAdmin()
    const { data, error } = await supabase.storage.from('reachout-imports').download(path)
    if (error) throw new Error(`Could not read uploaded file from storage: ${error.message}`)
    const text = await data.text()
    const result = await importCsvText(supabase, userId, fileName, text, path)
    return NextResponse.json(result)
  } catch (e) {
    console.error('Import processing error:', e)
    const message = e instanceof Error ? e.message : 'Import failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
