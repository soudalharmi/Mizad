import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { notifyUser } from '@/lib/push'
import { fmt } from '@/lib/money'

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
    case 'pay_support': r = await db.rpc('sm_pay_support', { p_user: u.id, p_support: b.supportId, p_amount: b.amount, p_method: b.method || null, p_date: b.date || null, p_ref: b.ref || null, p_notes: b.notes || null, p_receipt: b.receipt || null }); break
    case 'reverse': r = await db.rpc('sm_reverse', { p_user: u.id, p_payment: b.paymentId, p_reason: b.reason || '' }); break
    case 'delivery': r = await db.rpc('sm_delivery', { p_user: u.id, p_product: b.productId, p: b.data || {} }); break
    case 'act': r = await db.rpc('sm_action', { p_user: u.id, p_product: b.productId, p_action: b.name, p: b.data || {} }); break
    case 'portal': {
      const v = await db.rpc('sm_vendor', { p_user: u.id }); if (v.error) { r = v; break }
      r = await db.from('sale_owners').update({ portal: !!b.on }).eq('id', b.ownerId).eq('vendor_id', v.data); break }
    case 'rules': r = await db.rpc('sm_rules_save', { p_user: u.id, p: b.data || {} }); break
    default: return NextResponse.json({ error: 'BAD_ACTION' }, { status: 400 })
  }
  if (r.error) {
    const m = String(r.error.message || '')
    const known = /^[A-Z_]+$/.test(m)
    return NextResponse.json({ error: known ? m : m.includes('does not exist') || m.includes('schema cache') ? 'SALES_SETUP' : 'GENERIC', detail: known ? undefined : m.slice(0, 160) }, { status: 400 })
  }
  // tell the buyer: invoice ready after a confirmed sale, and a receipt after each payment they make
  try {
    if ((b.action === 'act' && b.name === 'confirm') || (b.action === 'pay' && b.kind === 'buyer')) {
      const { data: p } = await db.from('sale_products').select('name,buyer_user_id,sale_price_fils,vendors(name,currency)').eq('id', b.productId).maybeSingle()
      const vn = (p as any)?.vendors?.name || '', cur = (p as any)?.vendors?.currency
      if (p?.buyer_user_id) {
        const isPay = b.action === 'pay'
        notifyUser(p.buyer_user_id, (lang: string) => ({ title: isPay ? (lang === 'ar' ? 'تم تسجيل دفعتك' : 'Payment recorded') : (lang === 'ar' ? 'فاتورتك جاهزة' : 'Your invoice is ready'),
          body: isPay ? `${p.name} · ${fmt(Number(b.amount || 0), lang, cur)} · ${vn}` : `${p.name} · ${vn}`, url: '/', tag: 'invoice-' + b.productId, lang })).catch(() => {})
      }
    }
  } catch {}
  return NextResponse.json({ ok: true, result: r.data ?? null })
}
