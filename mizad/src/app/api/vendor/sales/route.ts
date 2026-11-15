import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'

// Every change in My Sales goes through here. The database functions check ownership, calculate
// commissions, issue the sequential document numbers and write the audit trail.
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { return NextResponse.json({ error: 'BAD_INPUT' }, { status: 400 }) }
  const db = admin(); let r: any
  switch (b.action) {
    case 'receive': r = await db.rpc('sm_receive', { p_user: u.id, p: b.data || {} }); break
    case 'pay': r = await db.rpc('sm_pay', { p_user: u.id, p_product: b.productId, p_kind: b.kind, p_amount: b.amount, p_method: b.method || null, p_date: b.date || null, p_ref: b.ref || null, p_notes: b.notes || null, p_receipt: b.receipt || null }); break
    case 'reverse': r = await db.rpc('sm_reverse', { p_user: u.id, p_payment: b.paymentId, p_reason: b.reason || '' }); break
    case 'delivery': r = await db.rpc('sm_delivery', { p_user: u.id, p_product: b.productId, p: b.data || {} }); break
    case 'act': r = await db.rpc('sm_action', { p_user: u.id, p_product: b.productId, p_action: b.name, p: b.data || {} }); break
    case 'rules': r = await db.rpc('sm_rules_save', { p_user: u.id, p: b.data || {} }); break
    default: return NextResponse.json({ error: 'BAD_ACTION' }, { status: 400 })
  }
  if (r.error) {
    const m = String(r.error.message || '')
    const known = /^[A-Z_]+$/.test(m)
    return NextResponse.json({ error: known ? m : m.includes('does not exist') || m.includes('schema cache') ? 'SALES_SETUP' : 'GENERIC', detail: known ? undefined : m.slice(0, 160) }, { status: 400 })
  }
  return NextResponse.json({ ok: true, result: r.data ?? null })
}
