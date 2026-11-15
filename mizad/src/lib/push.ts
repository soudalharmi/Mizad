// Server-only Web Push helpers. Keys are created once on first use and stored in push_config (service role only).
import webpush from 'web-push'
import { generateKeyPairSync } from 'crypto'
import { admin } from './supabase-server'
import { fmt } from './money'

const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
let cache: { pub: string; priv: string } | null = null

export async function vapid() {
  if (cache) return cache
  const db = admin()
  let { data } = await db.from('push_config').select('*').eq('id', 1).maybeSingle()
  if (!data) {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const pub = b64u((publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-65))
    const priv = (privateKey.export({ format: 'jwk' }) as any).d as string
    await db.from('push_config').upsert({ id: 1, public_key: pub, private_key: priv }, { onConflict: 'id', ignoreDuplicates: true })
    ;({ data } = await db.from('push_config').select('*').eq('id', 1).maybeSingle())
  }
  if (!data) throw new Error('PUSH_NOT_READY')
  cache = { pub: data.public_key, priv: data.private_key }
  webpush.setVapidDetails(process.env.NEXT_PUBLIC_SITE_URL || 'https://mazadboss.netlify.app', cache.pub, cache.priv)
  return cache
}

type Msg = { title: string; body: string; url: string; tag?: string; dir?: string; lang?: string }
export async function notifyUser(userId: string, build: (lang: string) => Msg) {
  try {
    const db = admin()
    const { data: subs } = await db.from('push_subs').select('*').eq('user_id', userId)
    if (!subs?.length) return
    await vapid()
    const sends = Promise.allSettled(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(build(s.lang)), { TTL: 120, urgency: 'high' })
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subs').delete().eq('id', s.id) // phone unsubscribed
      }
    }))
    await Promise.race([sends, new Promise(r => setTimeout(r, 3500))]) // never slow a bid down by more than a moment
  } catch (e) { console.error('push', e) }
}

// Tell the previous leader they were outbid on this product.
export async function notifyOutbid(prevLeaderBidderId: string, itemId: string) {
  const db = admin()
  const [{ data: b }, { data: it }] = await Promise.all([
    db.from('bidders').select('user_id').eq('id', prevLeaderBidderId).maybeSingle(),
    db.from('auction_items').select('name,current_price_fils,vendor_id,auction_type,revealed').eq('id', itemId).maybeSingle()])
  if (!b?.user_id || !it) return
  const { data: v } = await db.from('vendors').select('slug,currency').eq('id', it.vendor_id).maybeSingle()
  if (!v) return
  const hidden = it.auction_type === 'custom' && !it.revealed
  await notifyUser(b.user_id, lang => ({
    title: lang === 'ar' ? 'تمت المزايدة عليك' : "You've been outbid",
    body: hidden ? it.name : `${it.name}: ${lang === 'ar' ? 'السعر الآن' : 'now'} ${fmt(it.current_price_fils, lang, v.currency)}`,
    url: `/${v.slug}/live`, tag: 'outbid-' + itemId, dir: lang === 'ar' ? 'rtl' : 'ltr', lang,
  }))
}

// Tell product owners (matched by phone to a site account) when their product goes to auction and when it is sold.
// The database hands back each event once only (sm_owner_pending marks it as notified).
export async function notifyOwners(vendorId: string) {
  try {
    const { data } = await admin().rpc('sm_owner_pending', { p_vendor: vendorId })
    for (const e of (data || []) as any[]) {
      await notifyUser(e.user_id, lang => {
        const ar = lang === 'ar'
        return e.stage === 'sold'
          ? { title: ar ? 'تم بيع منتجك' : 'Your product is sold', body: `${e.name}: ${fmt(Number(e.price || 0), lang, e.currency)} · ${e.vendor}`, url: '/', tag: 'own-sold-' + e.id, dir: ar ? 'rtl' : 'ltr', lang }
          : { title: ar ? 'منتجك في المزاد الآن' : 'Your product is on auction now', body: `${e.name} · ${e.vendor}`, url: '/', tag: 'own-live-' + e.id, dir: ar ? 'rtl' : 'ltr', lang }
      })
    }
  } catch (e) { console.error('owner push', e) }
}
