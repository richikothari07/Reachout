import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const userId = u.searchParams.get('userId')
    const linkedinUrl = u.searchParams.get('linkedinUrl') || ''
    if (!userId || !linkedinUrl) return NextResponse.json({ error: 'userId and linkedinUrl are required.' }, { status: 400 })
    const sql = db()
    const data = await sql<any[]>`
      select sender_name, sender_url, recipient_name, recipient_urls, message_date, content, folder
      from public.messages
      where user_id = ${userId}::uuid
        and (${linkedinUrl} = sender_url or ${linkedinUrl} = recipient_urls)
      order by message_date desc
      limit 50
    `
    return NextResponse.json({ messages: data.map(m => ({ from: m.sender_name, sender: m.sender_url, to: m.recipient_name, recipient: m.recipient_urls, date: m.message_date, content: m.content, folder: m.folder })) })
  } catch (e) {
    console.error('GET /api/people/messages failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load messages.' }, { status: 500 })
  }
}
