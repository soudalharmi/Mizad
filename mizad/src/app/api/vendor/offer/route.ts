import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const { offerId, accept } = await req.json()
  const { data, error } = await admin().rpc('offer_decision', { p_user: u.id, p_offer: offerId, p_accept: !!accept })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, result: data })
}
