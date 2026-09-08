import { createClient } from '@supabase/supabase-js'

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase is not configured. Connect Supabase to this Vercel project.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
