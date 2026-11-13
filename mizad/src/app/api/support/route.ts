import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { stripe } from '@/lib/payments'
import { allow } from '@/lib/rate'

// The browser sends ONLY the proposed new price. The contribution amount is computed in the database.
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'NOT_APPROVED' }, { status: 401 })
  if (!allow('sup:' + u.id, 4)) return NextResponse.json({ error: 'RATE_LIMIT' }, { status: 429 })
  const { itemId, newPriceFils, idem } = await req.json()
  if (!Number.isInteger(newPriceFils) || !idem) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  const db = admin()
  const { data: c, error } = await db.rpc('request_support', { p_user: u.id, p_item: itemId, p_new_price: newPriceFils, p_idem: String(idem) })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  try {
    let pi
    if (c.payment_id) { // replay of the same request: reuse the same PaymentIntent
      const { data: p } = await db.from('payments').select('provider_ref').eq('id', c.payment_id).single()
      pi = await stripe().paymentIntents.retrieve(p!.provider_ref)
    } else {
      // Authorization hold only (capture_method=manual). Money is captured later, only if the beneficiary wins.
      pi = await stripe().paymentIntents.create({
        amount: c.amount_fils, currency: 'aed', capture_method: 'manual', automatic_payment_methods: { enabled: true },
        metadata: { contribution_id: c.id, vendor_id: c.vendor_id },
      }, { idempotencyKey: 'support-' + c.id })
      await db.rpc('attach_support_payment', { p_contribution: c.id, p_ref: pi.id })
    }
    return NextResponse.json({ clientSecret: pi.client_secret, contribution: c })
  } catch (e) {
    await db.from('support_contributions').update({ status: 'failed' }).eq('id', c.id)
    return NextResponse.json({ error: 'PAYMENT_UNAVAILABLE' }, { status: 502 })
  }
}
