import { NextResponse } from 'next/server'
import { supabaseAdmin, ensureImportBucket } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = supabaseAdmin()
    await ensureImportBucket(supabase)
    const checks: Record<string, unknown> = { backend: true, storage: true }
    for (const table of ['imports', 'connections', 'messages']) {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true })
      checks[table] = error ? error.message : true
    }
    const ok = Object.values(checks).every(v => v === true)
    return NextResponse.json({ ok, checks }, { status: ok ? 200 : 500 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Backend health check failed.' }, { status: 500 })
  }
}
