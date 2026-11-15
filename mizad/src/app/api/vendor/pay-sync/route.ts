import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { settle } from '@/lib/ziina'

// Called when the host opens the dashboard: confirms any payment that was paid but not yet recorded.
export async function POST() {
  const u = await currentUser()
  if (!u) return NextResponse.json({ changed: false })
  const db = admin()
  const { data: v } = await db.from('vendors').select('id').eq('owner_id', u.id).maybeSingle()
  if (!v) return NextResponse.json({ changed: false })
  const since = new Date(Date.now() - 3 * 86400000).toISOString()
  const { data: rows } = await db.from('ziina_intents').select('*').eq('vendor_id', v.id).eq('status', 'created').not('ziina_id', 'is', null).gte('created_at', since).limit(10)
  let changed = false
  for (const r of rows || []) { try { if (await settle(r)) changed = true } catch (e) { console.error('pay-sync', e) } }
  return NextResponse.json({ changed })
}
