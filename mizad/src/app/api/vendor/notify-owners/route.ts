import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { notifyOwners } from '@/lib/push'

// Called by the host's dashboard in the background after Open / Sold / accepting an offer,
// so those buttons confirm instantly and the owner notifications are sent separately.
export async function POST() {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const { data: v } = await admin().from('vendors').select('id').eq('owner_id', u.id).maybeSingle()
  if (v?.id) await notifyOwners(v.id)
  return NextResponse.json({ ok: true })
}
