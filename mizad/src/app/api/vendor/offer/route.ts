import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { notifyOwners } from '@/lib/push'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const { offerId, accept } = await req.json()
  const { data, error } = await admin().rpc('offer_decision', { p_user: u.id, p_offer: offerId, p_accept: !!accept })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const { data: o } = await admin().from('offers').select('vendor_id').eq('id', offerId).maybeSingle()
  if (o?.vendor_id) await notifyOwners(o.vendor_id)
  return NextResponse.json({ ok: true, result: data })
}
