import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { runProviderSync } from '@/lib/payments'
import { allow } from '@/lib/rate'
import { notifyOutbid } from '@/lib/push'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'NOT_APPROVED' }, { status: 401 })
  if (!allow('bid:' + u.id)) return NextResponse.json({ error: 'RATE_LIMIT' }, { status: 429 })
  const { itemId, amountFils, idem } = await req.json()
  if (!Number.isInteger(amountFils) || !idem) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  const db = admin()
  const { data: before } = await db.from('auction_items').select('leader_bidder_id').eq('id', itemId).maybeSingle()
  // The server decides validity: approval, status, step, minimum, locking and fee all happen inside place_bid().
  const { data, error } = await db.rpc('place_bid', { p_user: u.id, p_item: itemId, p_amount: amountFils, p_idem: String(idem) })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  runProviderSync().catch(() => {}) // release holds of the outbid leader's supporters
  if (before?.leader_bidder_id && before.leader_bidder_id !== (data as any)?.bidder_id) await notifyOutbid(before.leader_bidder_id, String(itemId))
  return NextResponse.json({ ok: true, bid: data })
}
