import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { classify, Connection, MessageStats, norm, dateMs } from '@/lib/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000

async function fetchAll<T>(queryFactory: (from: number, to: number) => any): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all.push(...((data || []) as T[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return all
}

function buildMessageStats(messages: any[], ownerName: string): Map<string, MessageStats> {
  const owner = norm(ownerName)
  const map = new Map<string, MessageStats>()
  for (const m of messages) {
    const senderName = String(m.sender_name || '')
    const senderUrl = String(m.sender_url || '').trim()
    const recipientName = String(m.recipient_name || '')
    const recipientUrls = String(m.recipient_urls || '').trim()
    const isSelf = norm(senderName) === owner
    const contactUrl = (isSelf ? recipientUrls : senderUrl).split(/[,;\s]+/).find(Boolean) || ''
    if (!contactUrl) continue
    const key = contactUrl.toLowerCase()
    const existing = map.get(key) || {
      contact_url: contactUrl,
      contact_name: isSelf ? recipientName : senderName,
      outgoing_count: 0,
      incoming_count: 0,
      last_outgoing: null,
      last_incoming: null,
    }
    if (isSelf) {
      existing.outgoing_count += 1
      if (!existing.last_outgoing || dateMs(m.message_date) > dateMs(existing.last_outgoing)) existing.last_outgoing = m.message_date
    } else {
      existing.incoming_count += 1
      if (!existing.last_incoming || dateMs(m.message_date) > dateMs(existing.last_incoming)) existing.last_incoming = m.message_date
    }
    map.set(key, existing)
  }
  return map
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    const ownerName = url.searchParams.get('ownerName') || 'Richi Kothari'
    const target = url.searchParams.get('target') || 'Product Manager'
    const days = Number(url.searchParams.get('days') || 7)
    if (!userId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 })

    const supabase = supabaseAdmin()

    // All DB work happens server-side. No browser Supabase client is used here.
    const connections = await fetchAll<Connection>((from, to) =>
      supabase.from('connections')
        .select('first_name,last_name,linkedin_url,company,position,connected_on')
        .eq('user_id', userId)
        .range(from, to)
    )

    const messages = await fetchAll<any>((from, to) =>
      supabase.from('messages')
        .select('sender_name,sender_url,recipient_name,recipient_urls,message_date')
        .eq('user_id', userId)
        .range(from, to)
    )

    const { data: imports, error: importsError } = await supabase.from('imports')
      .select('id,file_name,file_type,row_count,status,error,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (importsError) throw importsError

    const statsMap = buildMessageStats(messages, ownerName)
    const ranked = connections
      .map((c: any) => classify(c as Connection, target, statsMap.get(String(c.linkedin_url || '').toLowerCase())))
      .sort((a: any, b: any) => b.score - a.score)

    const followups = ranked.filter((p: any) =>
      p.action === 'Follow up' && p.lastOutgoing &&
      (Date.now() - dateMs(p.lastOutgoing)) / 86400000 >= days
    )

    return NextResponse.json({
      connectionsCount: connections.length,
      messagesCount: messages.length,
      imports: imports || [],
      people: ranked.slice(0, 5000),
      recommended: ranked.filter((p: any) => p.action === 'Reach out').slice(0, 10),
      followups: followups.slice(0, 100),
    })
  } catch (e) {
    console.error('Dashboard error:', e)
    const message = e instanceof Error ? e.message : 'Could not load dashboard.'
    return NextResponse.json({ error: `Dashboard error: ${message}` }, { status: 500 })
  }
}
