import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { db } from '@/lib/db'
export const runtime = 'nodejs'
export async function DELETE(req: Request) {
  try {
    const { userId, importId } = await req.json()
    if (!userId || !importId) return NextResponse.json({ error: 'userId and importId are required.' }, { status: 400 })
    const sql = db()
    const rows = await sql<{ file_path: string }[]>`select file_path from public.imports where id=${importId}::uuid and user_id=${userId}::uuid limit 1`
    if (!rows[0]) return NextResponse.json({ error: 'Import not found.' }, { status: 404 })
    await sql`delete from public.imports where id=${importId}::uuid and user_id=${userId}::uuid`
    if (rows[0].file_path) await supabaseAdmin().storage.from('reachout-imports').remove([rows[0].file_path])
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/import/delete failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not remove import.' }, { status: 500 })
  }
}
