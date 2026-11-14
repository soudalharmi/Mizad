import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { runProviderSync } from '@/lib/payments'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const { action, title } = await req.json()
  const db = admin()
  const r = action === 'start' ? await db.rpc('start_session', { p_user: u.id, p_title: String(title || '') })
    : action === 'end' ? await db.rpc('end_session', { p_user: u.id }) : null
  if (!r) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 })
  if (action === 'end') runProviderSync().catch(() => {})
  return NextResponse.json({ ok: true })
}
