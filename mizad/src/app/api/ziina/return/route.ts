import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase-server'
import { settle } from '@/lib/ziina'

// Ziina sends the customer here after paying. We still confirm the payment with Ziina before marking anything paid.
export async function GET(req: Request) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const site = host ? `https://${host}` : process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
  const ref = new URL(req.url).searchParams.get('ref') || ''
  let ok = false
  if (/^[0-9a-f-]{36}$/i.test(ref)) {
    const { data: row } = await admin().from('ziina_intents').select('*').eq('ref', ref).maybeSingle()
    try { ok = !!row && await settle(row) } catch (e) { console.error('ziina return', e) }
  }
  return NextResponse.redirect(`${site}/dashboard?paid=${ok ? 1 : 0}`)
}
