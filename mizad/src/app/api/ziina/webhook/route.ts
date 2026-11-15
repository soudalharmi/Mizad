import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase-server'
import { settle } from '@/lib/ziina'

// Backup path in case the customer closes the page before returning. The body is never trusted:
// we only read an id from it, then ask Ziina for the real status.
export async function POST(req: Request) {
  const body: any = await req.json().catch(() => ({}))
  const id = String(body?.data?.id || body?.payment_intent?.id || body?.payment_intent_id || body?.id || '')
  if (id) {
    const { data: row } = await admin().from('ziina_intents').select('*').eq('ziina_id', id).maybeSingle()
    if (row) await settle(row).catch(e => console.error('ziina webhook', e))
  }
  return NextResponse.json({ ok: true })
}
