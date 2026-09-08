import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { db } from '@/lib/db'
export const runtime = 'nodejs'
export async function DELETE(req: Request) {
  try {
    const { userId } = await req.json()
    if (!userId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 })
    const sql = db()
    const imports = await sql<{ file_path: string }[]>`select file_path from public.imports where user_id=${userId}::uuid`
    await sql.begin(async tx => {
      await tx`delete from public.messages where user_id=${userId}::uuid`
      await tx`delete from public.connections where user_id=${userId}::uuid`
      await tx`delete from public.imports where user_id=${userId}::uuid`
    })
    if (imports.length) await supabaseAdmin().storage.from('reachout-imports').remove(imports.map(x => x.file_path))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/reset failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not reset data.' }, { status: 500 })
  }
}
