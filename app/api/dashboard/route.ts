import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { classify, Connection, MessageStats, norm, dateMs } from '@/lib/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000

async function fetchAllMessages(supabase:any, userId:string) {
  const all:any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('messages')
      .select('sender_name,sender_url,recipient_name,recipient_urls,message_date')
      .eq('user_id', userId)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return all
}

function buildMessageStats(messages:any[], ownerName:string):Map<string,MessageStats> {
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
      last_incoming: null
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

export async function GET(req:Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    const ownerName = url.searchParams.get('ownerName') || 'Richi Kothari'
    const target = url.searchParams.get('target') || 'Product Manager'
    const days = Number(url.searchParams.get('days') || 7)
    if (!userId) return NextResponse.json({ error:'userId is required.' }, { status:400 })

    const supabase = supabaseAdmin()

    // Keep all table access inside Postgres. This avoids relying on the
    // PostgREST table schema cache for the dashboard queries.
    const { data: payload, error } = await supabase.rpc('get_reachout_dashboard', {
      p_user_id: userId,
    })
    if (error) throw new Error(`Dashboard database error: ${error.message}`)

    const connections = Array.isArray(payload?.connections) ? payload.connections : []
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    const imports = Array.isArray(payload?.imports) ? payload.imports : []

    const statsMap = buildMessageStats(messages, ownerName)
    const ranked = connections
      .map((c:any) => classify(c as Connection, target, statsMap.get(String(c.linkedin_url || '').toLowerCase())))
      .sort((a:any,b:any) => b.score - a.score)

    const followups = ranked.filter((p:any) =>
      p.action === 'Follow up' && p.lastOutgoing &&
      (Date.now() - dateMs(p.lastOutgoing)) / 86400000 >= days
    )

    return NextResponse.json({
      connectionsCount: connections.length,
      messagesCount: messages.length,
      imports,
      people: ranked.slice(0,5000),
      recommended: ranked.filter((p:any) => p.action === 'Reach out').slice(0,10),
      followups: followups.slice(0,100)
    })
  } catch (e) {
    console.error('Dashboard error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load dashboard.' }, { status:500 })
  }
}
