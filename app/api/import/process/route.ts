import { NextResponse } from 'next/server'
import Papa from 'papaparse'
import { supabaseAdmin } from '@/lib/supabase-server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60

function findHeader(text: string, matcher: (h: string[]) => boolean) {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const parsed = Papa.parse<string[]>(lines[i], { skipEmptyLines: false }).data?.[0] || []
    const h = parsed.map(x => String(x).trim())
    if (matcher(h)) return lines.slice(i).join('\n')
  }
  throw new Error('LinkedIn header not found.')
}

function guess(text: string, fileName: string) {
  const n = fileName.toLowerCase()
  if (n.includes('message')) return 'messages' as const
  if (n.includes('connection')) return 'connections' as const
  if (text.includes('CONVERSATION ID') && text.includes('CONTENT')) return 'messages' as const
  if (text.includes('First Name') && text.includes('Last Name') && text.includes('Company')) return 'connections' as const
  throw new Error('Could not identify this LinkedIn export.')
}

async function markImport(sql: ReturnType<typeof db>, id: string, patch: { row_count?: number; status?: string; error?: string | null }) {
  await sql`
    update public.imports
    set row_count = coalesce(${patch.row_count ?? null}, row_count),
        status = coalesce(${patch.status ?? null}, status),
        error = ${patch.error ?? null}
    where id = ${id}::uuid
  `
}

export async function POST(req: Request) {
  let importId: string | undefined
  try {
    const { userId, path, fileName } = await req.json()
    if (!userId || !path || !fileName) {
      return NextResponse.json({ error: 'userId, path and fileName are required.' }, { status: 400 })
    }

    const supabase = supabaseAdmin()
    const sql = db()
    const raw = await supabase.storage.from('reachout-imports').download(path)
    if (raw.error) throw raw.error
    const text = await raw.data.text()
    const type = guess(text, fileName)

    const created = await sql<{ id: string }[]>`
      insert into public.imports (user_id, file_name, file_path, file_type, status)
      values (${userId}::uuid, ${fileName}, ${path}, ${type}, 'processing')
      returning id
    `
    importId = created[0].id

    if (type === 'connections') {
      const body = findHeader(text, h => h.includes('First Name') && h.includes('Last Name') && h.includes('Company') && h.includes('Position'))
      const parsed = Papa.parse<Record<string, string>>(body, {
        header: true, skipEmptyLines: true,
        transformHeader: h => h.replace(/^\uFEFF/, '').trim()
      })
      if (parsed.errors.length) console.warn('Connections CSV parse warnings:', parsed.errors.slice(0, 5))
      const rows = parsed.data.map(x => {
        const url = String(x.URL || '').trim()
        return {
          user_id: userId, import_id: importId, linkedin_url: url,
          dedupe_key: (url.toLowerCase() || `${String(x['First Name'] || '').trim()}|${String(x['Last Name'] || '').trim()}|${String(x.Company || '').trim()}`).toLowerCase(),
          first_name: String(x['First Name'] || '').trim(), last_name: String(x['Last Name'] || '').trim(),
          company: String(x.Company || '').trim(), position: String(x.Position || '').trim(), connected_on: String(x['Connected On'] || '').trim()
        }
      }).filter(x => x.first_name || x.last_name)

      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        await sql`
          insert into public.connections
            (user_id, import_id, linkedin_url, dedupe_key, first_name, last_name, company, position, connected_on)
          select user_id::uuid, import_id::uuid, linkedin_url, dedupe_key, first_name, last_name, company, position, connected_on
          from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as x(
            user_id text, import_id text, linkedin_url text, dedupe_key text,
            first_name text, last_name text, company text, position text, connected_on text
          )
          on conflict (user_id, dedupe_key) do update set
            import_id = excluded.import_id,
            linkedin_url = excluded.linkedin_url,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            company = excluded.company,
            position = excluded.position,
            connected_on = excluded.connected_on
        `
      }
      await markImport(sql, importId, { row_count: rows.length, status: 'ready' })
      return NextResponse.json({ type, rows: rows.length })
    }

    const body = findHeader(text, h => h.includes('CONVERSATION ID') && h.includes('FROM') && h.includes('TO') && h.includes('CONTENT'))
    const parsed = Papa.parse<Record<string, string>>(body, {
      header: true, skipEmptyLines: true,
      transformHeader: h => h.replace(/^\uFEFF/, '').trim()
    })
    if (parsed.errors.length) console.warn('Messages CSV parse warnings:', parsed.errors.slice(0, 5))
    const rows = parsed.data.map(x => ({
      user_id: userId, import_id: importId,
      conversation_id: String(x['CONVERSATION ID'] || '').trim(),
      dedupe_key: `${String(x['CONVERSATION ID'] || '').trim()}|${String(x.DATE || '').trim()}|${String(x.FROM || '').trim()}|${String(x.TO || '').trim()}|${String(x.CONTENT || '')}`.toLowerCase(),
      sender_name: String(x.FROM || '').trim(), sender_url: String(x['SENDER PROFILE URL'] || '').trim(),
      recipient_name: String(x.TO || '').trim(), recipient_urls: String(x['RECIPIENT PROFILE URLS'] || '').trim(),
      message_date: String(x.DATE || '').trim(), content: String(x.CONTENT || ''), folder: String(x.FOLDER || '').trim()
    })).filter(x => x.sender_name || x.recipient_name || x.content)

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500)
      await sql`
        insert into public.messages
          (user_id, import_id, conversation_id, dedupe_key, sender_name, sender_url, recipient_name, recipient_urls, message_date, content, folder)
        select user_id::uuid, import_id::uuid, conversation_id, dedupe_key, sender_name, sender_url, recipient_name, recipient_urls, message_date, content, folder
        from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as x(
          user_id text, import_id text, conversation_id text, dedupe_key text,
          sender_name text, sender_url text, recipient_name text, recipient_urls text,
          message_date text, content text, folder text
        )
        on conflict (user_id, dedupe_key) do update set
          import_id = excluded.import_id,
          sender_name = excluded.sender_name,
          sender_url = excluded.sender_url,
          recipient_name = excluded.recipient_name,
          recipient_urls = excluded.recipient_urls,
          message_date = excluded.message_date,
          content = excluded.content,
          folder = excluded.folder
      `
    }
    await markImport(sql, importId, { row_count: rows.length, status: 'ready' })
    return NextResponse.json({ type, rows: rows.length })
  } catch (e) {
    console.error('POST /api/import/process failed:', e)
    if (importId) {
      try { await markImport(db(), importId, { status: 'error', error: e instanceof Error ? e.message : 'Import failed' }) } catch {}
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed.' }, { status: 500 })
  }
}
