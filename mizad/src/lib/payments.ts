import Stripe from 'stripe'
import { admin } from './supabase-server'
export const stripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || '')

// Applies queued provider actions (release holds / capture winner support / refunds), then marks them done in the DB.
export async function runProviderSync() {
  const db = admin()
  const { data } = await db.from('payments').select('id,provider_ref,provider_sync').neq('provider_sync', 'none').limit(50)
  for (const p of data || []) {
    try {
      const o = { idempotencyKey: `${p.provider_sync}-${p.id}` }
      if (p.provider_sync === 'cancel_needed') await stripe().paymentIntents.cancel(p.provider_ref, {}, o)
      if (p.provider_sync === 'capture_needed') await stripe().paymentIntents.capture(p.provider_ref, {}, o)
      if (p.provider_sync === 'refund_needed') await stripe().refunds.create({ payment_intent: p.provider_ref }, o)
      await db.rpc('finish_provider_sync', { p_payment: p.id })
    } catch (e) { console.error('provider sync failed', p.id, e) } // stays queued; the cron retries it
  }
}
