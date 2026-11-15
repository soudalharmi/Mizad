import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'

// What the signed-in person may see about their own sales: purchases (as buyer) and, when a host
// has switched it on for their phone number, sales of products they handed over (as original owner).
export async function GET() {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const digits = String(u.phone || '').replace(/\D/g, '')
  const { data, error } = await admin().rpc('sm_my_sales', { p_user: u.id, p_digits: digits })
  if (error) return NextResponse.json({ error: 'GENERIC', detail: String(error.message).slice(0, 120) }, { status: 400 })
  return NextResponse.json({ ok: true, buys: data?.buys || [], owned: data?.owned || [] })
}
