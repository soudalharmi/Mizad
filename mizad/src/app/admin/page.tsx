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

  // Hosts who owe service fees: unbilled fees + open invoices, with name, phone and email
  const [vs, fs, is] = await Promise.all([
    db.from('vendors').select('id,name,slug,phone,owner_id,status'),
    db.from('item_service_fees').select('vendor_id,amount_fils').is('invoice_id', null),
    db.from('invoices').select('vendor_id,total_fils').eq('status', 'open')])
  const due: Record<string, number> = {}
  for (const f of fs.data || []) due[f.vendor_id] = (due[f.vendor_id] || 0) + Number(f.amount_fils)
  for (const i of is.data || []) due[i.vendor_id] = (due[i.vendor_id] || 0) + Number(i.total_fils)
  const owing = (vs.data || []).filter((v: any) => due[v.id] > 0)
  const outstanding = await Promise.all(owing.map(async (v: any) => {
    const { data } = await db.auth.admin.getUserById(v.owner_id)
    return { id: v.id, name: v.name, slug: v.slug, phone: v.phone, status: v.status, email: data?.user?.email || '', amount_fils: due[v.id] }
  }))
  outstanding.sort((a, b) => b.amount_fils - a.amount_fils)
  const [pl, cd, sv, rev] = await Promise.all([
    db.from('sub_plans').select('*').order('tier').order('months'),
    db.from('discount_codes').select('*').order('created_at', { ascending: false }),
    db.from('vendors').select('id,sub_until,plan_tier'),
    db.from('payments').select('amount_fils').eq('kind', 'subscription').eq('status', 'captured')])
  const subs = Object.fromEntries((sv.data || []).map((x: any) => [x.id, x.sub_until])), tiers = Object.fromEntries((sv.data || []).map((x: any) => [x.id, x.plan_tier]))
  const subRev = (rev.data || []).reduce((n: number, x: any) => n + Number(x.amount_fils), 0)
  return <AdminClient overview={overview} settings={settings} outstanding={outstanding} plans={pl.data || []} codes={cd.data || []} subs={subs} tiers={tiers} subRev={subRev} />
}
