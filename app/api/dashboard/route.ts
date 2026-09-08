import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classify, Connection, MessageStats } from '@/lib/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    const ownerName = url.searchParams.get('ownerName') || 'Richi Kothari'
    const target = url.searchParams.get('target') || 'Product Manager'
    const days = Number(url.searchParams.get('days') || 7)
    if (!userId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 })

    const sql = db()
    const [connections, stats, imports, messageCount] = await Promise.all([
      sql<Connection[]>`
        select first_name, last_name, linkedin_url, company, position, connected_on
        from public.connections
        where user_id = ${userId}::uuid
        order by created_at desc
        limit 50000
      `,
      sql<MessageStats[]>`
        with expanded as (
          select m.*,
            lower(trim(m.sender_name)) = lower(trim(${ownerName})) as is_self
          from public.messages m
          where m.user_id = ${userId}::uuid
        ), contacts as (
          select
            case when is_self then nullif(recipient_urls,'') else nullif(sender_url,'') end as url,
            case when is_self then nullif(recipient_name,'') else nullif(sender_name,'') end as name,
            is_self, message_date
          from expanded
        )
        select url as contact_url,
          max(name) filter (where name is not null) as contact_name,
          count(*) filter (where is_self)::bigint as outgoing_count,
          count(*) filter (where not is_self)::bigint as incoming_count,
          max(message_date) filter (where is_self) as last_outgoing,
          max(message_date) filter (where not is_self) as last_incoming
        from contacts
        where url is not null
        group by url
      `,
      sql`
        select id, file_name, file_type, row_count, status, error, created_at
        from public.imports
        where user_id = ${userId}::uuid
        order by created_at desc
        limit 100
      `,
      sql<{ count: string }[]>`
        select count(*)::text as count from public.messages where user_id = ${userId}::uuid
      `,
    ])

    const statsMap = new Map<string, MessageStats>(stats.map((s) => [String(s.contact_url).toLowerCase(), s]))
    const ranked = connections
      .map((c) => classify(c, target, statsMap.get(String(c.linkedin_url || '').toLowerCase())))
      .sort((a: any, b: any) => b.score - a.score)

    const followups = ranked.filter((p: any) =>
      p.action === 'Follow up' && p.lastOutgoing &&
      (Date.now() - Date.parse(p.lastOutgoing.replace(' UTC', 'Z'))) / 86400000 >= days
    )

    return NextResponse.json({
      connectionsCount: connections.length,
      messagesCount: Number(messageCount[0]?.count || 0),
      imports,
      people: ranked.slice(0, 5000),
      recommended: ranked.filter((p: any) => p.action === 'Reach out').slice(0, 10),
      followups: followups.slice(0, 100),
    })
  } catch (e) {
    console.error('GET /api/dashboard failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load dashboard.' }, { status: 500 })
  }
}
