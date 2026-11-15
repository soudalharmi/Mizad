import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { admin, currentUser } from '@/lib/supabase-server'
import { vapid } from '@/lib/push'
export const dynamic = 'force-dynamic'
// Sends a test notification to every phone of the signed-in user and reports each step, for troubleshooting.
export async function POST() {
  const u = await currentUser()
  if (!u) return NextResponse.json({ step: 'login', error: 'not signed in' }, { status: 401 })
  try { await vapid() } catch (e: any) { return NextResponse.json({ step: 'keys', error: String(e?.message || e) }, { status: 500 }) }
  const db = admin()
  const { data: subs, error } = await db.from('push_subs').select('*').eq('user_id', u.id)
  if (error) return NextResponse.json({ step: 'database', error: error.message }, { status: 500 })
  if (!subs?.length) return NextResponse.json({ step: 'subscriptions', error: 'no phone registered for this account', count: 0 })
  const results = await Promise.all(subs.map(async (s: any) => {
    try {
      const r: any = await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: s.lang === 'en' ? 'MazadBoss test' : 'تجربة MazadBoss', body: s.lang === 'en' ? 'Notifications are working.' : 'التنبيهات تعمل بنجاح.', url: '/', tag: 'test' }), { TTL: 60, urgency: 'high' })
      return { service: new URL(s.endpoint).host, ok: true, status: r?.statusCode }
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subs').delete().eq('id', s.id)
      return { service: new URL(s.endpoint).host, ok: false, status: e?.statusCode, error: String(e?.body || e?.message || e).slice(0, 200) }
    }
  }))
  return NextResponse.json({ step: 'sent', count: subs.length, results })
}
