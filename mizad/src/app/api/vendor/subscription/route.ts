import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'

// Host subscription: current status, history and prices for every active plan (computed by the database).
async function host() {
  const u = await currentUser(); if (!u) return null
  const { data: v } = await admin().from('vendors').select('id,status,sub_until').eq('owner_id', u.id).maybeSingle()
  return v
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
  return NextResponse.json({ ok: true, status: v.status, sub_until: v.sub_until, plans: quotes, history: hist || [], trial_days: s?.trial_days || 0 })
}

export async function POST(req: Request) {
  const v = await host(); if (!v) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const { data, error } = await admin().rpc('sub_quote', { p_months: Number(b.months), p_code: b.code || null })
  if (error) return NextResponse.json({ error: /CODE_INVALID/.test(error.message) ? 'CODE_INVALID' : /PLAN_INVALID/.test(error.message) ? 'PLAN_INVALID' : 'GENERIC' }, { status: 400 })
  return NextResponse.json({ ok: true, quote: data })
}
