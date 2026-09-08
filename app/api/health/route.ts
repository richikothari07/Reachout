import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const sql = db()
    const result = await sql<{ connections: string; messages: string; imports: string }[]>`
      select
        (select count(*)::text from public.connections) as connections,
        (select count(*)::text from public.messages) as messages,
        (select count(*)::text from public.imports) as imports
    `
    return NextResponse.json({ ok: true, database: true, ...result[0] })
  } catch (e) {
    console.error('GET /api/health failed:', e)
    return NextResponse.json({ ok: false, database: false, error: e instanceof Error ? e.message : 'Database connection failed' }, { status: 500 })
  }
}
