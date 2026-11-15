import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { allow } from '@/lib/rate'

// Bid Support with no payment: the browser sends only the proposed new price.
// The supporter chooses a bidder (never the current leader). The database records the support and makes that bidder the leader.
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'NOT_APPROVED' }, { status: 401 })
  if (!allow('sup:' + u.id, 4)) return NextResponse.json({ error: 'RATE_LIMIT' }, { status: 429 })
  const { itemId, beneficiaryId, newPriceFils, idem } = await req.json()
  if (!Number.isInteger(newPriceFils) || !idem || !beneficiaryId) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  const { data, error } = await admin().rpc('support_bid', { p_user: u.id, p_item: itemId, p_beneficiary: String(beneficiaryId), p_new_price: newPriceFils, p_idem: String(idem) })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, contribution: data })
}
