import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase-server'
import { runProviderSync } from '@/lib/payments'

// Vercel Cron: auto-invoices per the admin's billing mode, and retries any failed Stripe actions.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({}, { status: 401 })
  const { data } = await admin().rpc('run_billing')
  await runProviderSync()
  return NextResponse.json({ invoices: data })
}
