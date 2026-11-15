import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { runProviderSync } from '@/lib/payments'
import { notifyOwners } from '@/lib/push'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const { itemId, action } = await req.json()
  const { error } = await admin().rpc('vendor_item_action', { p_user: u.id, p_item: itemId, p_action: action })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  runProviderSync().catch(() => {}) // captures winner support / cancels unpaid holds
  const { data: it } = await admin().from('auction_items').select('vendor_id').eq('id', itemId).maybeSingle()
  if (it?.vendor_id) await notifyOwners(it.vendor_id)
  return NextResponse.json({ ok: true })
}
