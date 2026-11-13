import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase-server'
import { runProviderSync, stripe } from '@/lib/payments'

export async function POST(req: Request) {
  const body = await req.text()
  let ev
  try { ev = stripe().webhooks.constructEvent(body, req.headers.get('stripe-signature')!, process.env.STRIPE_WEBHOOK_SECRET!) }
  catch { return NextResponse.json({ error: 'bad signature' }, { status: 400 }) }
  const db = admin()
  const { error: dup } = await db.from('webhook_events').insert({ id: ev.id })
  if (dup) return NextResponse.json({ ok: true, duplicate: true }) // already processed
  const o: any = ev.data.object
  if (ev.type === 'payment_intent.amount_capturable_updated') await db.rpc('confirm_support', { p_ref: o.id })
  else if (ev.type === 'payment_intent.payment_failed' || ev.type === 'payment_intent.canceled') await db.rpc('fail_support', { p_ref: o.id })
  else if (ev.type === 'checkout.session.completed' && o.payment_status === 'paid') {
    const m = o.metadata || {}
    if (m.kind === 'activation') await db.rpc('activate_vendor', { p_vendor: m.vendor_id, p_amount: o.amount_total, p_ref: o.payment_intent })
    if (m.kind === 'invoice') await db.rpc('mark_invoice_paid', { p_invoice: m.invoice_id, p_ref: o.payment_intent })
  }
  await runProviderSync().catch(() => {})
  return NextResponse.json({ ok: true })
}
