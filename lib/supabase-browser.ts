import { createClient } from '@supabase/supabase-js'
export function supabaseBrowser(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if(!url||!key) throw new Error('Supabase is not configured. Add the two NEXT_PUBLIC_SUPABASE variables in Vercel.')
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}
