import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase-server'
import { allow } from '@/lib/rate'
import { validDob } from '@/lib/dob'
import { CURRENCIES } from '@/lib/currency'
import { slugify } from '@/lib/slug'
import { normalizePhone } from '@/lib/phone'

// Creates an account on the server so no SMS/email code is needed.
// kind 'bidder': nickname, phone, dob, password.  kind 'host': email, auctionName, phone, dob, password, currency (also creates the auction page).
// The browser then signs in with the same password.
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
const normPhone = (p: string) => normalizePhone(String(p || ''))

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'x'
  if (!allow('reg:' + ip, 5, 60000)) return bad('RATE_LIMIT', 429)
  const b = await req.json().catch(() => ({}))
  const kind = b.kind === 'host' ? 'host' : 'bidder'
  const password = String(b.password || ''), dob = String(b.dob || ''), phone = normPhone(b.phone)
  if (password.length < 8) return bad('PW_SHORT')
  if (!validDob(dob)) return bad('BAD_DOB')
  if (phone.length < 9) return bad('BAD_PHONE')
  const db = admin()

  if (kind === 'bidder') {
    const nickname = String(b.nickname || '').trim().slice(0, 40)
    if (!nickname) return bad('NAME_REQUIRED')
    const { data: chk, error: ce } = await db.rpc('signup_available', { p_phone: phone, p_name: nickname })
    if (ce) return bad('GENERIC', 500)
    if (chk !== 'OK') return bad(chk)
    const { data, error } = await db.auth.admin.createUser({ phone, password, phone_confirm: true, user_metadata: { full_name: nickname } })
    if (error || !data.user) return bad(/already|exists|registered/i.test(error?.message || '') ? 'PHONE_TAKEN' : 'GENERIC', 400)
    await db.from('profiles').upsert({ id: data.user.id, full_name: nickname, dob })
    return NextResponse.json({ ok: true, phone })
  }

  // host
  const email = String(b.email || '').trim().toLowerCase(), name = String(b.auctionName || '').trim().slice(0, 60)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('BAD_EMAIL')
  if (!name) return bad('NAME_REQUIRED')
  const currency = String(b.currency || 'AED')
  if (!CURRENCIES.some(c => c.code === currency)) return bad('GENERIC')
  const base = slugify(name)
  let slug = ''
  for (let n = 1; n <= 30 && !slug; n++) {
    const s = n === 1 ? base : `${base.slice(0, 27)}-${n}`
    const { data: free } = await db.rpc('slug_available', { p_slug: s })
    if (free) slug = s
  }
  if (!slug) return bad('SLUG_TAKEN')
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } })
  if (error || !data.user) return bad(/already|exists|registered/i.test(error?.message || '') ? 'EMAIL_TAKEN' : 'GENERIC', 400)
  const uid = data.user.id
  await db.from('profiles').upsert({ id: uid, full_name: name, dob })
  const { error: ve } = await db.from('vendors').insert({ owner_id: uid, slug, name, phone, currency })
  if (ve) { await db.auth.admin.deleteUser(uid); return bad(ve.code === '23505' ? 'SLUG_TAKEN' : 'GENERIC', 400) }
  return NextResponse.json({ ok: true, slug })
}
