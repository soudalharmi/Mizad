import { NextResponse } from 'next/server'
import { admin, currentUser, isSuperAdmin } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u || !(await isSuperAdmin(u.id))) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const b = await req.json(); const db = admin()
  if (b.action === 'settings') {
    const v = b.values
    const { error } = await db.from('platform_settings').update({
      activation_fee_fils: v.activation_fee_fils, item_fee_fils: v.item_fee_fils, billing_mode: v.billing_mode,
      billing_threshold_fils: v.billing_threshold_fils, min_session_fee_fils: v.min_session_fee_fils ?? 0, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await db.rpc('audit', { p_vendor: null, p_actor: u.id, p_action: 'settings.updated', p_entity: 'settings', p_id: null, p_data: v })
  } else if (b.action === 'vendor') {
    if (!['active', 'suspended'].includes(b.status)) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
    await db.from('vendors').update({ status: b.status }).eq('id', b.id).neq('status', 'pending_activation')
    await db.rpc('audit', { p_vendor: b.id, p_actor: u.id, p_action: 'vendor.' + b.status, p_entity: 'vendor', p_id: b.id, p_data: {} })
  } else if (b.action === 'refund') {
    const { error } = await db.rpc('refund_contribution', { p_contribution: b.id, p_reason: b.reason || 'admin' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { runProviderSync } = await import('@/lib/payments'); await runProviderSync()
  }
  return NextResponse.json({ ok: true })
}
