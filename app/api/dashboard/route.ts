import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { classify, Connection, MessageStats, dateMs } from '@/lib/shared'

export const runtime = 'nodejs'
export const maxDuration = 60

function buildMessageStats(messages: any[], ownerName: string): MessageStats[] {
  const owner = ownerName.trim().toLowerCase()
  const map = new Map<string, MessageStats>()

  for (const m of messages) {
    const sender = String(m.sender_name || '').trim()
    const isSelf = sender.toLowerCase() === owner
    const url = String(isSelf ? (m.recipient_urls || '') : (m.sender_url || '')).trim()
    const name = String(isSelf ? (m.recipient_name || '') : (m.sender_name || '')).trim()
    if (!url) continue

    const key = url.toLowerCase()
    const existing = map.get(key) || {
      contact_url: url,
      contact_name: name,
      outgoing_count: 0,
      incoming_count: 0,
      last_outgoing: null,
      last_incoming: null
    }

    if (name) existing.contact_name = name

    const messageDate = String(m.message_date || '')
    if (isSelf) {
      existing.outgoing_count += 1
      if (!existing.last_outgoing || dateMs(messageDate) > dateMs(existing.last_outgoing)) {
        existing.last_outgoing = messageDate
      }
    } else {
      existing.incoming_count += 1
      if (!existing.last_incoming || dateMs(messageDate) > dateMs(existing.last_incoming)) {
        existing.last_incoming = messageDate
      }
    }

    map.set(key, existing)
  }

  return Array.from(map.values())
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    const ownerName = url.searchParams.get('ownerName') || 'Richi Kothari'
    const target = url.searchParams.get('target') || 'Product Manager'
    const days = Number(url.searchParams.get('days') || 7)

    if (!userId) {
      return NextResponse.json({ error: 'userId is required.' }, { status: 400 })
    }

    const supabase = supabaseAdmin()

    // Query each resource separately so a database issue is reported precisely.
    const { data: connections, error: cErr } = await supabase
      .from('connections')
      .select('first_name,last_name,linkedin_url,company,position,connected_on')
      .eq('user_id', userId)
      .limit(50000)

    if (cErr) {
      throw new Error(`Could not load connections: ${cErr.message}`)
    }

    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('sender_name,sender_url,recipient_name,recipient_urls,message_date')
      .eq('user_id', userId)
      .limit(100000)

    if (msgErr) {
      throw new Error(`Could not load messages: ${msgErr.message}`)
    }

    const { data: imports, error: iErr } = await supabase
      .from('imports')
      .select('id,file_name,file_type,row_count,status,error,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (iErr) {
      throw new Error(`Could not load imports: ${iErr.message}`)
    }

    const { count: messagesCount, error: mErr } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (mErr) {
      throw new Error(`Could not count messages: ${mErr.message}`)
    }

    const stats = buildMessageStats(messages || [], ownerName)
    const statsMap = new Map<string, MessageStats>(
      stats.map((s) => [String(s.contact_url).toLowerCase(), s])
    )

    const ranked = (connections || [])
      .map((c: any) =>
        classify(
          c as Connection,
          target,
          statsMap.get(String(c.linkedin_url || '').toLowerCase())
        )
      )
      .sort((a: any, b: any) => b.score - a.score)

    const followups = ranked.filter(
      (p: any) =>
        p.action === 'Follow up' &&
        p.lastOutgoing &&
        (Date.now() - Date.parse(p.lastOutgoing.replace(' UTC', 'Z'))) / 86400000 >= days
    )

    return NextResponse.json({
      connectionsCount: connections?.length || 0,
      messagesCount: messagesCount || 0,
      imports: imports || [],
      people: ranked.slice(0, 5000),
      recommended: ranked.filter((p: any) => p.action === 'Reach out').slice(0, 10),
      followups: followups.slice(0, 100)
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not load dashboard.'
    console.error('Dashboard error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
