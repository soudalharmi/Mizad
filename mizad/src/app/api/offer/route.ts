import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { allow } from '@/lib/rate'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'NOT_APPROVED' }, { status: 401 })
  if (!allow('offer:' + u.id, 5, 10000)) return NextResponse.json({ error: 'RATE_LIMIT' }, { status: 429 })
  const { itemId, amountFils, idem } = await req.json()
  if (!Number.isInteger(amountFils) || !idem) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  const { data, error } = await admin().rpc('submit_offer', { p_user: u.id, p_item: itemId, p_amount: amountFils, p_idem: String(idem) })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, offer: data })
}
