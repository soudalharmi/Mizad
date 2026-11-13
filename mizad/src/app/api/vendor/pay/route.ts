import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { stripe } from '@/lib/payments'

// kind: 'activation' (one time) | 'invoice' (service fees). Money is only confirmed by the webhook, never by this route.
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const { kind, invoiceId } = await req.json()
  const db = admin()
  const { data: v } = await db.from('vendors').select('*').eq('owner_id', u.id).maybeSingle()
  if (!v) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const site = process.env.NEXT_PUBLIC_SITE_URL
  let amount = 0, name = '', meta: any = { kind, vendor_id: v.id }, key = ''
  if (kind === 'activation') {
    if (v.status !== 'pending_activation') return NextResponse.json({ error: 'ALREADY_ACTIVE' }, { status: 400 })
    const { data: s } = await db.from('platform_settings').select('activation_fee_fils').single()
    amount = s!.activation_fee_fils; name = 'MIZAD account activation'; key = 'act-' + v.id
    if (amount === 0) { await db.rpc('activate_vendor', { p_vendor: v.id, p_amount: 0, p_ref: 'free-' + v.id }); return NextResponse.json({ url: site + '/dashboard' }) }
  } else if (kind === 'invoice') {
    const { data: inv } = await db.from('invoices').select('*').eq('id', invoiceId).eq('vendor_id', v.id).eq('status', 'open').maybeSingle()
    if (!inv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    amount = inv.total_fils; name = 'MIZAD service fees'; meta.invoice_id = inv.id; key = 'inv-' + inv.id
  } else return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  const session = await stripe().checkout.sessions.create({
    mode: 'payment', metadata: meta, payment_intent_data: { metadata: meta },
    line_items: [{ quantity: 1, price_data: { currency: 'aed', unit_amount: amount, product_data: { name } } }],
    success_url: site + '/dashboard?paid=1', cancel_url: site + '/dashboard',
  }, { idempotencyKey: key })
  return NextResponse.json({ url: session.url })
}
