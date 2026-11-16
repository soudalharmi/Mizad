import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
import { createIntent } from '@/lib/ziina'

// kind: 'activation' (one time) | 'fees' (pay all service fees due) | 'invoice' (one specific invoice).
// Money is only confirmed by asking Ziina (return page, webhook or sync), never by this route.
// Every failure returns a code plus a short detail so the host can see exactly which step failed.
const fail = (error: string, detail: string, status = 400) => NextResponse.json({ error, detail }, { status })

export async function POST(req: Request) {
  try {
    const u = await currentUser()
    if (!u) return fail('FORBIDDEN', 'not signed in', 401)
    const { kind, invoiceId, months, code } = await req.json()
    const db = admin()
    const { data: v, error: ve } = await db.from('vendors').select('*').eq('owner_id', u.id).maybeSingle()
    if (ve) return fail('GENERIC', 'vendors: ' + ve.message, 500)
    if (!v) return fail('FORBIDDEN', 'no host page for this account', 403)
    if (!process.env.ZIINA_API_TOKEN) return fail('PAY_UNAVAILABLE', 'ZIINA_API_TOKEN is not set in Netlify', 500)
    const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    let amount = 0, name = '', invoice: string | null = null, k: 'activation' | 'invoice' | 'subscription' = 'invoice', extra: any = {}

    if (kind === 'subscription') {
      if (v.status === 'suspended') return fail('FORBIDDEN', 'account suspended', 403)
      const { data: q, error: qe } = await db.rpc('sub_quote', { p_months: Number(months), p_code: code || null })
      if (qe) return fail(/CODE_INVALID|PLAN_INVALID/.test(qe.message) ? (qe.message.match(/CODE_INVALID|PLAN_INVALID/)![0]) : 'GENERIC', qe.message)
      if (Number(q.total) === 0) {
        const { error: fe } = await db.rpc('apply_subscription', { p_vendor: v.id, p_months: q.months, p_days: 0, p_list: q.list, p_amount: 0, p_ref: 'free-' + crypto.randomUUID(), p_code_id: q.code_id, p_kind: 'free' })
        if (fe) return fail('GENERIC', fe.message, 500)
        return NextResponse.json({ url: site + '/dashboard?paid=1' })
      }
      amount = Number(q.total); name = `Mazad Boss subscription · ${q.months} month${q.months > 1 ? 's' : ''}`; k = 'subscription'
      extra = { months: q.months, code_id: q.code_id, list_fils: q.list }
    } else if (kind === 'activation') {
      if (v.status !== 'pending_activation') return fail('ALREADY_ACTIVE', 'already active')
      const { data: s } = await db.from('platform_settings').select('activation_fee_fils').single()
      amount = s!.activation_fee_fils; name = 'Mazad Boss account activation'; k = 'activation'
      if (amount === 0) { await db.rpc('activate_vendor', { p_vendor: v.id, p_amount: 0, p_ref: 'free-' + v.id }); return NextResponse.json({ url: site + '/dashboard' }) }
    } else if (kind === 'invoice' || kind === 'fees') {
      if (kind === 'fees') {
        const { error: ge } = await db.rpc('generate_invoice', { p_vendor: v.id }) // bundle unbilled fees into an invoice
        if (ge) return fail('GENERIC', 'generate_invoice: ' + ge.message, 500)
        // merge every open invoice into the oldest one so a single payment settles everything
        const { data: open, error: oe } = await db.from('invoices').select('id,total_fils').eq('vendor_id', v.id).eq('status', 'open').order('created_at')
        if (oe) return fail('GENERIC', 'invoices: ' + oe.message, 500)
        if (open && open.length > 1) {
          const keep = open[0].id, rest = open.slice(1).map((x: any) => x.id)
          const m1 = await db.from('item_service_fees').update({ invoice_id: keep }).in('invoice_id', rest)
          if (m1.error) return fail('GENERIC', 'merge fees: ' + m1.error.message, 500)
          await db.from('ziina_intents').update({ invoice_id: keep }).in('invoice_id', rest) // old unpaid attempts point to the kept invoice
          const { data: sum } = await db.from('item_service_fees').select('amount_fils').eq('invoice_id', keep)
          const total = (sum || []).reduce((n: number, x: any) => n + Number(x.amount_fils), 0)
          const m2 = await db.from('invoices').update({ total_fils: total }).eq('id', keep)
          if (m2.error) return fail('GENERIC', 'merge total: ' + m2.error.message, 500)
          const m3 = await db.from('invoices').delete().in('id', rest)
          if (m3.error) return fail('GENERIC', 'merge delete: ' + m3.error.message, 500)
        }
      }
      const q = db.from('invoices').select('*').eq('vendor_id', v.id).eq('status', 'open')
      const { data: inv } = kind === 'invoice' ? await q.eq('id', invoiceId).maybeSingle() : await q.order('created_at').limit(1).maybeSingle()
      if (!inv) return fail('NOTHING_DUE', 'no open invoice', 404)
      amount = Number(inv.total_fils); name = 'Mazad Boss service fees'; invoice = inv.id
    } else return fail('GENERIC', 'unknown kind')
    if (amount < 200) return fail('PAY_MIN', 'amount below AED 2: ' + amount)

    const { data: row, error } = await db.from('ziina_intents').insert({ vendor_id: v.id, kind: k, invoice_id: invoice, amount_fils: amount, ...extra }).select('ref').single()
    if (error || !row) return fail('GENERIC', 'ziina_intents: ' + (error?.message || 'no row'), 500)
    try {
      const it = await createIntent({
        amount, message: name,
        success_url: `${site}/api/ziina/return?ref=${row.ref}`, cancel_url: `${site}/dashboard`, failure_url: `${site}/dashboard`,
      })
      await db.from('ziina_intents').update({ ziina_id: it.id }).eq('ref', row.ref)
      return NextResponse.json({ url: it.redirect_url })
    } catch (e: any) {
      console.error('ziina create failed', e)
      await db.from('ziina_intents').update({ status: 'failed' }).eq('ref', row.ref)
      return fail('PAY_UNAVAILABLE', String(e?.message || e), 502)
    }
  } catch (e: any) {
    console.error('pay route crashed', e)
    return fail('GENERIC', 'crash: ' + String(e?.message || e), 500)
  }
}
