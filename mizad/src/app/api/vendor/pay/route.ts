import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { createIntent } from '@/lib/ziina'

// kind: 'activation' (one time) | 'fees' (pay all service fees due) | 'invoice' (one specific invoice).
// Money is only confirmed by asking Ziina (return page, webhook or sync), never by this route.
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const { kind, invoiceId } = await req.json()
  const db = admin()
  const { data: v } = await db.from('vendors').select('*').eq('owner_id', u.id).maybeSingle()
  if (!v) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const site = process.env.NEXT_PUBLIC_SITE_URL
  let amount = 0, name = '', invoice: string | null = null, k: 'activation' | 'invoice' = 'invoice'
  if (kind === 'activation') {
    if (v.status !== 'pending_activation') return NextResponse.json({ error: 'ALREADY_ACTIVE' }, { status: 400 })
    const { data: s } = await db.from('platform_settings').select('activation_fee_fils').single()
    amount = s!.activation_fee_fils; name = 'MIZAD account activation'; k = 'activation'
    if (amount === 0) { await db.rpc('activate_vendor', { p_vendor: v.id, p_amount: 0, p_ref: 'free-' + v.id }); return NextResponse.json({ url: site + '/dashboard' }) }
  } else if (kind === 'invoice' || kind === 'fees') {
    if (kind === 'fees') await db.rpc('generate_invoice', { p_vendor: v.id }) // bundle any unbilled fees into an invoice
    if (kind === 'fees') { // merge every open invoice into the oldest one so a single payment settles everything
      const { data: open } = await db.from('invoices').select('id,total_fils').eq('vendor_id', v.id).eq('status', 'open').order('created_at')
      if (open && open.length > 1) {
        const keep = open[0].id, rest = open.slice(1).map((x: any) => x.id)
        await db.from('item_service_fees').update({ invoice_id: keep }).in('invoice_id', rest)
        await db.from('invoices').update({ total_fils: open.reduce((n: number, x: any) => n + Number(x.total_fils), 0) }).eq('id', keep)
        await db.from('invoices').delete().in('id', rest)
      }
    }
    const q = db.from('invoices').select('*').eq('vendor_id', v.id).eq('status', 'open')
    const { data: inv } = kind === 'invoice' ? await q.eq('id', invoiceId).maybeSingle() : await q.order('created_at').limit(1).maybeSingle()
    if (!inv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    amount = inv.total_fils; name = 'MIZAD service fees'; invoice = inv.id
  } else return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  if (amount < 200) return NextResponse.json({ error: 'GENERIC' }, { status: 400 }) // Ziina minimum is AED 2

  const { data: row, error } = await db.from('ziina_intents').insert({ vendor_id: v.id, kind: k, invoice_id: invoice, amount_fils: amount }).select('ref').single()
  if (error || !row) return NextResponse.json({ error: 'GENERIC' }, { status: 500 })
  try {
    const it = await createIntent({
      amount, message: name,
      success_url: `${site}/api/ziina/return?ref=${row.ref}`, cancel_url: `${site}/dashboard`, failure_url: `${site}/dashboard`,
    })
    await db.from('ziina_intents').update({ ziina_id: it.id }).eq('ref', row.ref)
    return NextResponse.json({ url: it.redirect_url })
  } catch (e) {
    console.error('ziina create failed', e)
    await db.from('ziina_intents').update({ status: 'failed' }).eq('ref', row.ref)
    return NextResponse.json({ error: 'PAY_UNAVAILABLE' }, { status: 502 })
  }
}
