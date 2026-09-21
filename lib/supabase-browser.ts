import { createClient } from '@supabase/supabase-js'

const rememberKey = 'reachout_stay_signed_in'

const adaptiveStorage = {
  getItem(key: string) {
    if (typeof window === 'undefined') return null
    const remember = window.localStorage.getItem(rememberKey) !== 'false'
    return (remember ? window.localStorage : window.sessionStorage).getItem(key)
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return
    const remember = window.localStorage.getItem(rememberKey) !== 'false'
    const target = remember ? window.localStorage : window.sessionStorage
    const other = remember ? window.sessionStorage : window.localStorage
    target.setItem(key, value)
    // Avoid leaving an old session behind when the user changes the preference.
    other.removeItem(key)
  },
  removeItem(key: string) {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  },
}

export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: adaptiveStorage,
    },
  }
)
