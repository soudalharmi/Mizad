import { NextResponse } from 'next/server'
import { admin, currentUser } from '@/lib/supabase-server'
// Saves this phone's notification subscription for the signed-in user.
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 })
  const { sub, lang } = await req.json().catch(() => ({}))
  const endpoint = String(sub?.endpoint || ''), p256dh = String(sub?.keys?.p256dh || ''), auth = String(sub?.keys?.auth || '')
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return NextResponse.json({ error: 'GENERIC' }, { status: 400 })
  const { error } = await admin().from('push_subs').upsert({ user_id: u.id, endpoint, p256dh, auth, lang: lang === 'en' ? 'en' : 'ar' }, { onConflict: 'endpoint' })
  if (error) { console.error('push subscribe', error); return NextResponse.json({ error: 'GENERIC' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
