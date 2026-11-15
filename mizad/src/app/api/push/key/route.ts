import { NextResponse } from 'next/server'
import { vapid } from '@/lib/push'
export const dynamic = 'force-dynamic'
// Public key the browser needs to subscribe to notifications.
export async function GET() {
  try { const { pub } = await vapid(); return NextResponse.json({ key: pub }) }
  catch (e) { console.error('push key', e); return NextResponse.json({ error: 'GENERIC' }, { status: 500 }) }
}
