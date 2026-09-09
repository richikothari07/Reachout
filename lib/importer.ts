import crypto from 'crypto'
import Papa from 'papaparse'

export type ImporterSupabase = any

function findHeader(text: string, matcher: (h: string[]) => boolean) {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const parsed = Papa.parse<string[]>(lines[i], { skipEmptyLines: false }).data?.[0] || []
    const h = parsed.map(x => String(x).trim())
    if (matcher(h)) return lines.slice(i).join('\n')
  }
  throw new Error('LinkedIn CSV header not found. Please upload the original Connections.csv or messages.csv export.')
}

function guess(text: string, fileName: string) {
  const n = fileName.toLowerCase()
  if (n.includes('message')) return 'messages' as const
  if (n.includes('education') || n.includes('school')) return 'education' as const
  if (n.includes('connection')) return 'connections' as const
  if (text.includes('CONVERSATION ID') && text.includes('CONTENT')) return 'messages' as const
  if ((text.includes('School Name') || text.includes('SCHOOL NAME')) && (text.includes('First Name') || text.includes('FIRST NAME'))) return 'education' as const
  if (text.includes('First Name') && text.includes('Last Name') && text.includes('Company')) return 'connections' as const
  throw new Error('Could not identify this LinkedIn export. Upload the LinkedIn Connections.csv or messages.csv file.')
}

export async function importCsvText(supabase: ImporterSupabase, userId: string, fileName: string, text: string, filePath: string | null = null) {
  const type = guess(text, fileName)
  // `file_path` is required/unique in some ReachOut DB versions. Even for
  // direct (<4 MB) uploads, give the import a unique logical path instead of
  // inserting NULL. This keeps the importer compatible with both schemas.
  const importPath = filePath || `direct/${userId}/${crypto.randomUUID()}/${fileName}`

  const { data: imp, error: impErr } = await supabase.from('imports').insert({
    user_id: userId,
    file_name: fileName,
    file_path: importPath,
    file_type: type,
    status: 'processing',
  }).select('id').single()
  if (impErr) throw new Error(`Could not create import record: ${impErr.message}`)

  const importId = imp.id
  try {
    if (type === 'connections') {
      const body = findHeader(text, h => h.includes('First Name') && h.includes('Last Name') && h.includes('Company') && h.includes('Position'))
      const parsed = Papa.parse<Record<string, string>>(body, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.replace(/^\uFEFF/, '').trim(),
      })
      if (parsed.errors.length) {
        const serious = parsed.errors.filter(e => e.code !== 'UndetectableDelimiter')
        if (serious.length) throw new Error(`Could not parse Connections.csv: ${serious[0].message}`)
      }
      const rows = parsed.data.map(x => {
        const first = String(x['First Name'] || '').trim()
        const last = String(x['Last Name'] || '').trim()
        const url = String(x.URL || '').trim()
        const company = String(x.Company || '').trim()
        return {
          user_id: userId,
          import_id: importId,
          linkedin_url: url,
          email: String(x['Email Address'] || '').trim(),
          dedupe_key: (url.toLowerCase() || `${first}|${last}|${company}`.toLowerCase()),
          first_name: first,
          last_name: last,
          company,
          position: String(x.Position || '').trim(),
          connected_on: String(x['Connected On'] || '').trim(),
        }
      }).filter(x => x.first_name || x.last_name)

      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('connections').upsert(rows.slice(i, i + 500), {
          onConflict: 'user_id,dedupe_key',
          ignoreDuplicates: true,
        })
        if (error) throw new Error(`Could not save connections (rows ${i + 1}-${Math.min(i + 500, rows.length)}): ${error.message}`)
      }
      const { error: updateError } = await supabase.from('imports').update({ row_count: rows.length, status: 'ready', error: null }).eq('id', importId)
      if (updateError) throw new Error(`Imported connections, but could not update import status: ${updateError.message}`)
      return { type, rows: rows.length, importId }
    }

    if (type === 'education') {
      const body = findHeader(text, h => (h.includes('School Name') || h.includes('SCHOOL NAME')) && (h.includes('First Name') || h.includes('FIRST NAME')))
      const parsed = Papa.parse<Record<string, string>>(body, { header: true, skipEmptyLines: true, transformHeader: h => h.replace(/^\uFEFF/, '').trim() })
      const rows = parsed.data.map(x => {
        const first = String(x['First Name'] || x['FIRST NAME'] || '').trim()
        const last = String(x['Last Name'] || x['LAST NAME'] || '').trim()
        const school = String(x['School Name'] || x['SCHOOL NAME'] || x['School'] || '').trim()
        const degree = String(x['Degree Name'] || x['DEGREE NAME'] || '').trim()
        const field = String(x['Field Of Study'] || x['FIELD OF STUDY'] || '').trim()
        const url = String(x.URL || x['Profile URL'] || x['LinkedIn URL'] || '').trim()
        return { first, last, school, education: [school, degree, field].filter(Boolean).join(' · '), url }
      }).filter(x => x.first || x.last || x.url)
      let updated = 0
      for (const row of rows) {
        let q = supabase.from('connections').update({ education: row.education }).eq('user_id', userId)
        if (row.url) q = q.eq('linkedin_url', row.url)
        else { q = q.eq('first_name', row.first).eq('last_name', row.last) }
        const { data, error } = await q.select('id')
        if (error) throw new Error(`Could not save education: ${error.message}`)
        updated += (data || []).length
      }
      const { error: updateError } = await supabase.from('imports').update({ row_count: updated, status: 'ready', error: null }).eq('id', importId)
      if (updateError) throw new Error(`Saved education, but could not update import status: ${updateError.message}`)
      return { type, rows: updated, importId }
    }

    const body = findHeader(text, h => h.includes('CONVERSATION ID') && h.includes('FROM') && h.includes('TO') && h.includes('CONTENT'))
    const parsed = Papa.parse<Record<string, string>>(body, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.replace(/^\uFEFF/, '').trim(),
    })
    if (parsed.errors.length) {
      const serious = parsed.errors.filter(e => e.code !== 'UndetectableDelimiter')
      if (serious.length) throw new Error(`Could not parse messages.csv: ${serious[0].message}`)
    }
    const rows = parsed.data.map(x => ({
      user_id: userId,
      import_id: importId,
      conversation_id: String(x['CONVERSATION ID'] || '').trim(),
      dedupe_key: `${String(x['CONVERSATION ID'] || '').trim()}|${String(x.DATE || '').trim()}|${String(x.FROM || '').trim()}|${String(x.TO || '').trim()}|${String(x.CONTENT || '')}`.toLowerCase(),
      sender_name: String(x.FROM || '').trim(),
      sender_url: String(x['SENDER PROFILE URL'] || '').trim(),
      recipient_name: String(x.TO || '').trim(),
      recipient_urls: String(x['RECIPIENT PROFILE URLS'] || '').trim(),
      conversation_title: String(x['CONVERSATION TITLE'] || '').trim(),
      message_date: String(x.DATE || '').trim(),
      subject: String(x.SUBJECT || '').trim(),
      content: String(x.CONTENT || ''),
      folder: String(x.FOLDER || '').trim(),
      attachments: String(x.ATTACHMENTS || '').trim(),
    })).filter(x => x.sender_name || x.recipient_name || x.content)

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('messages').upsert(rows.slice(i, i + 500), {
        onConflict: 'user_id,dedupe_key',
        ignoreDuplicates: true,
      })
      if (error) throw new Error(`Could not save messages (rows ${i + 1}-${Math.min(i + 500, rows.length)}): ${error.message}`)
    }
    const { error: updateError } = await supabase.from('imports').update({ row_count: rows.length, status: 'ready', error: null }).eq('id', importId)
    if (updateError) throw new Error(`Imported messages, but could not update import status: ${updateError.message}`)
    return { type, rows: rows.length, importId }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Import failed.'
    await supabase.from('imports').update({ status: 'error', error: message }).eq('id', importId)
    throw e
  }
}
