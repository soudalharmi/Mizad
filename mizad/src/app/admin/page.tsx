import { redirect } from 'next/navigation'
import { admin, currentUser, isSuperAdmin } from '@/lib/supabase-server'
import AdminClient from './AdminClient'
export const dynamic = 'force-dynamic'
export default async function Page() {
  const u = await currentUser()
  if (!u || !(await isSuperAdmin(u.id))) redirect('/login')
  const db = admin()
  const { data: overview } = await db.rpc('admin_overview')
  const { data: settings } = await db.from('platform_settings').select('*').single()
  return <AdminClient overview={overview} settings={settings} />
}
