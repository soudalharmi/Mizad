import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { allow } from '@/lib/rate'

// Bid Support with no payment: the browser sends only the proposed new price.
// The database checks it, records the supporter and raises the price for the current leader.
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'NOT_APPROVED' }, { status: 401 })
  if (!allow('sup:' + u.id, 4)) return NextResponse.json({ error: 'RATE_LIMIT' }, { status: 429 })
  const { itemId, newPriceFils, idem } = await req.json()
  if (!Number.isInteger(newPriceFils) || !idem) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  const { data, error } = await admin().rpc('support_bid', { p_user: u.id, p_item: itemId, p_new_price: newPriceFils, p_idem: String(idem) })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, contribution: data })
}
