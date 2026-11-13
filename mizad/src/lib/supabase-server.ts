import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export function serverClient() {
  const c = cookies()
  return createServerClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => c.getAll(), setAll: (l) => { try { l.forEach(({ name, value, options }) => c.set(name, value, options)) } catch {} } },
  })
}
// service role: bypasses RLS. Use ONLY in server routes, after checking the caller.
export const admin = () => createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
export async function currentUser() { const { data } = await serverClient().auth.getUser(); return data.user }
export async function isSuperAdmin(uid: string) {
  const { data } = await admin().from('profiles').select('role').eq('id', uid).maybeSingle()
  return data?.role === 'super_admin'
}
