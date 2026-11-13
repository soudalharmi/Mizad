import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { runProviderSync } from '@/lib/payments'
import { allow } from '@/lib/rate'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'NOT_APPROVED' }, { status: 401 })
  if (!allow('bid:' + u.id)) return NextResponse.json({ error: 'RATE_LIMIT' }, { status: 429 })
  const { itemId, amountFils, idem } = await req.json()
  if (!Number.isInteger(amountFils) || !idem) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  // The server decides validity: approval, status, step, minimum, locking and fee all happen inside place_bid().
  const { data, error } = await admin().rpc('place_bid', { p_user: u.id, p_item: itemId, p_amount: amountFils, p_idem: String(idem) })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  runProviderSync().catch(() => {}) // release holds of the outbid leader's supporters
  return NextResponse.json({ ok: true, bid: data })
}
