import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'

// Host subscription: current status, history and prices for every active plan (computed by the database).
async function host() {
  const u = await currentUser(); if (!u) return null
  const { data: v } = await admin().from('vendors').select('id,status,sub_until').eq('owner_id', u.id).maybeSingle()
  return v ? { ...v, uid: u.id } : null
}

export async function GET() {
  const v = await host(); if (!v) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const db = admin()
  const [{ data: plans }, { data: hist }, { data: s }] = await Promise.all([
    db.from('sub_plans').select('months').eq('active', true).order('months'),
    db.from('subscriptions').select('kind,months,days,starts_at,ends_at,amount_fils,list_fils,code,created_at').eq('vendor_id', v.id).order('created_at', { ascending: false }).limit(24),
    db.from('platform_settings').select('trial_days').single()])
  const quotes = []
  for (const p of plans || []) { const { data } = await db.rpc('sub_quote', { p_months: p.months, p_code: null }); if (data) quotes.push(data) }
  const trialDays = Number(s?.trial_days || 0)
  return NextResponse.json({ ok: true, status: v.status, sub_until: v.sub_until, plans: quotes, history: hist || [], trial_days: trialDays, trial_available: trialDays > 0 && (hist || []).length === 0 })
}

export async function POST(req: Request) {
  const v = await host(); if (!v) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (b.action === 'trial') {
    const { data, error } = await admin().rpc('start_trial', { p_vendor: v.id, p_actor: v.uid })
    if (error) return NextResponse.json({ error: /TRIAL_USED/.test(error.message) ? 'TRIAL_USED' : /TRIAL_OFF/.test(error.message) ? 'TRIAL_OFF' : 'GENERIC' }, { status: 400 })
    return NextResponse.json({ ok: true, until: data })
  }
  const { data, error } = await admin().rpc('sub_quote', { p_months: Number(b.months), p_code: b.code || null })
  if (error) return NextResponse.json({ error: /CODE_INVALID/.test(error.message) ? 'CODE_INVALID' : /PLAN_INVALID/.test(error.message) ? 'PLAN_INVALID' : 'GENERIC' }, { status: 400 })
  return NextResponse.json({ ok: true, quote: data })
}
