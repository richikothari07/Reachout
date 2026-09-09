import { createClient } from '@supabase/supabase-js'

export function supabaseAdmin() {
  // Vercel + Supabase Marketplace variables first, with legacy fallbacks.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase backend is not configured. Check SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel.')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  })
}

export async function ensureImportBucket(supabase: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`Could not access Supabase Storage: ${error.message}`)
  if (!data?.some((b: any) => b.name === 'reachout-imports')) {
    const { error: createError } = await supabase.storage.createBucket('reachout-imports', { public: false })
    if (createError && !/already exists/i.test(createError.message)) {
      throw new Error(`Could not create reachout-imports bucket: ${createError.message}`)
    }
  }
}

export async function authenticatedUser(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) throw new Error('Authentication required. Please sign in.')
  const supabase = supabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new Error('Your session has expired. Please sign in again.')
  return data.user
}
