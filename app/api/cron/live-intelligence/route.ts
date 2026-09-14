import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (cronSecret && auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = supabaseAdmin()
  const { data: users, error } = await supabase.from('connections').select('user_id').limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const userIds = [...new Set((users || []).map((x: any) => x.user_id).filter(Boolean))]
  const origin = new URL(req.url).origin
  const results: any[] = []

  for (const rawUserId of userIds) {
    const userId = String(rawUserId)
    try {
      const r = await fetch(`${origin}/api/live-intelligence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${cronSecret || ''}`, 'x-reachout-cron': userId },
        body: JSON.stringify({ limit: 12 }),
        cache: 'no-store',
      })
      results.push({ userId, status: r.status })
    } catch (e) {
      results.push({ userId, status: 'error', error: e instanceof Error ? e.message : 'failed' })
    }
  }
  return NextResponse.json({ users: userIds.length, results })
}
