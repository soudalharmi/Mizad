import { admin } from './supabase-server'

const BASE = 'https://api-v2.ziina.com/api'
const headers = () => ({ Authorization: `Bearer ${process.env.ZIINA_API_TOKEN || ''}`, 'content-type': 'application/json' })

export async function createIntent(p: { amount: number; message: string; success_url: string; cancel_url: string; failure_url: string }) {
  const r = await fetch(BASE + '/payment_intent', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ amount: p.amount, currency_code: 'AED', message: p.message, success_url: p.success_url, cancel_url: p.cancel_url, failure_url: p.failure_url, test: process.env.ZIINA_TEST === 'true' }),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j.id || !j.redirect_url) throw new Error('ZIINA_CREATE_FAILED ' + r.status)
  return j as { id: string; redirect_url: string }
}

export async function getIntent(id: string) {
  const r = await fetch(BASE + '/payment_intent/' + encodeURIComponent(id), { headers: headers(), cache: 'no-store' })
  if (!r.ok) throw new Error('ZIINA_GET_FAILED ' + r.status)
  return (await r.json()) as { id: string; status: string; amount: number }
}

// Never trusts a redirect or webhook body: asks Ziina for the payment itself and checks status and amount.
// Safe to call many times (the database functions it calls only act once).
export async function settle(row: any): Promise<boolean> {
  if (!row?.ziina_id) return false
  if (row.status === 'paid') return true
  const db = admin()
  const it = await getIntent(row.ziina_id)
  if (it.status === 'failed' || it.status === 'canceled') { await db.from('ziina_intents').update({ status: 'failed' }).eq('ref', row.ref).eq('status', 'created'); return false }
  if (it.status !== 'completed' || Number(it.amount) !== Number(row.amount_fils)) return false
  const { error } = row.kind === 'invoice'
    ? await db.rpc('mark_invoice_paid', { p_invoice: row.invoice_id, p_ref: row.ziina_id })
    : await db.rpc('activate_vendor', { p_vendor: row.vendor_id, p_amount: row.amount_fils, p_ref: row.ziina_id })
  if (error) throw new Error('SETTLE_FAILED ' + error.message)
  await db.from('payments').update({ provider: 'ziina' }).eq('provider_ref', row.ziina_id)
  await db.from('ziina_intents').update({ status: 'paid' }).eq('ref', row.ref)
  return true
}
