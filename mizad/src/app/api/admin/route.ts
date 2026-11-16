import { NextResponse } from 'next/server'
import { admin, currentUser, isSuperAdmin } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u || !(await isSuperAdmin(u.id))) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const b = await req.json(); const db = admin()
  if (b.action === 'settings') {
    const v = b.values
    const { error } = await db.from('platform_settings').update({
      item_fee_fils: v.item_fee_fils, billing_mode: v.billing_mode,
      sub_month_fils: Math.max(0, Math.round(Number(v.sub_month_fils) || 0)), sub_month_semi_fils: Math.max(0, Math.round(Number(v.sub_month_semi_fils) || 0)), trial_days: Math.min(365, Math.max(0, Math.round(Number(v.trial_days) || 0))),
      billing_threshold_fils: v.billing_threshold_fils, min_session_fee_fils: v.min_session_fee_fils ?? 0, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await db.rpc('audit', { p_vendor: null, p_actor: u.id, p_action: 'settings.updated', p_entity: 'settings', p_id: null, p_data: v })
  } else if (b.action === 'vendor') {
    if (!['active', 'suspended'].includes(b.status)) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
    await db.from('vendors').update({ status: b.status }).eq('id', b.id).neq('status', 'pending_activation')
    await db.rpc('audit', { p_vendor: b.id, p_actor: u.id, p_action: 'vendor.' + b.status, p_entity: 'vendor', p_id: b.id, p_data: {} })
  } else if (b.action === 'plans') {
    for (const p of (b.plans || []) as any[]) {
      const m = Math.round(Number(p.months)), d = Number(p.discount_pct)
      if (!(m >= 1 && m <= 36) || !(d >= 0 && d <= 100)) return NextResponse.json({ error: 'BAD_PLAN' }, { status: 400 })
      const { error } = await db.from('sub_plans').upsert({ tier: p.tier === 'semi' ? 'semi' : 'full', months: m, discount_pct: d, active: !!p.active })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    await db.rpc('audit', { p_vendor: null, p_actor: u.id, p_action: 'plans.updated', p_entity: 'settings', p_id: null, p_data: { plans: b.plans } })
  } else if (b.action === 'code_save') {
    const c = b.code || {}, code = String(c.code || '').trim().toUpperCase()
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) return NextResponse.json({ error: 'CODE_FORMAT' }, { status: 400 })
    const row = { code, kind: c.kind === 'fixed' ? 'fixed' : 'percent', value: Number(c.value), max_uses: c.max_uses ? Math.round(Number(c.max_uses)) : null,
      valid_until: c.valid_until || null, plan_months: c.plan_months ? Number(c.plan_months) : null, tier: c.tier === 'semi' || c.tier === 'full' ? c.tier : null, note: c.note || null, active: c.active !== false }
    if (!(row.value > 0) || (row.kind === 'percent' && row.value > 100)) return NextResponse.json({ error: 'CODE_VALUE' }, { status: 400 })
    const { error } = c.id ? await db.from('discount_codes').update(row).eq('id', c.id) : await db.from('discount_codes').insert(row)
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'CODE_TAKEN' : error.message }, { status: 400 })
    await db.rpc('audit', { p_vendor: null, p_actor: u.id, p_action: 'code.saved', p_entity: 'settings', p_id: null, p_data: row })
  } else if (b.action === 'code_toggle') {
    await db.from('discount_codes').update({ active: !!b.active }).eq('id', b.id)
  } else if (b.action === 'code_delete') {
    const { data: c } = await db.from('discount_codes').select('used_count').eq('id', b.id).maybeSingle()
    if (c && c.used_count > 0) await db.from('discount_codes').update({ active: false }).eq('id', b.id) // used codes are kept for the record
    else await db.from('discount_codes').delete().eq('id', b.id)
  } else if (b.action === 'extend') {
    const days = Math.round(Number(b.days))
    if (!(days >= 1 && days <= 3650)) return NextResponse.json({ error: 'BAD_DAYS' }, { status: 400 })
    const { error } = await db.rpc('apply_subscription', { p_vendor: b.id, p_months: 0, p_days: days, p_list: 0, p_amount: 0, p_ref: 'admin-' + crypto.randomUUID(), p_code_id: null, p_kind: 'admin', p_actor: u.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  } else if (b.action === 'refund') {
    const { error } = await db.rpc('refund_contribution', { p_contribution: b.id, p_reason: b.reason || 'admin' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { runProviderSync } = await import('@/lib/payments'); await runProviderSync()
  }
  return NextResponse.json({ ok: true })
}
