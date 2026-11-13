import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'

export async function POST() {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const db = admin()
  const { data: v } = await db.from('vendors').select('id').eq('owner_id', u.id).maybeSingle()
  if (!v) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const { data } = await db.rpc('generate_invoice', { p_vendor: v.id })
  return NextResponse.json({ invoiceId: data })
}
