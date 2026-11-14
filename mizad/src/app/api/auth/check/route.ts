import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase-server'
import { allow } from '@/lib/rate'

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'x'
  if (!allow('chk:' + ip, 6, 10000)) return NextResponse.json({ error: 'RATE_LIMIT' }, { status: 429 })
  const { phone, name } = await req.json()
  const { data, error } = await admin().rpc('signup_available', { p_phone: String(phone || ''), p_name: String(name || '') })
  if (error) return NextResponse.json({ error: 'GENERIC' }, { status: 500 })
  return NextResponse.json({ result: data })
}
