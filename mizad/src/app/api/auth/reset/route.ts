import { NextResponse } from 'next/server'
import { admin } from '@/lib/supabase-server'
import { allow } from '@/lib/rate'
import { validDob } from '@/lib/dob'

// Forgot password: bidder gives phone + date of birth, host gives email + date of birth, plus a new password.
// The database allows 5 wrong tries per account per hour (reset_verify), so dates of birth cannot be guessed.
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'x'
  if (!allow('rst:' + ip, 5, 60000)) return bad('RATE_LIMIT', 429)
  const b = await req.json().catch(() => ({}))
  const kind = b.kind === 'host' ? 'host' : 'bidder', dob = String(b.dob || ''), password = String(b.password || '')
  const ident = kind === 'host' ? String(b.email || '') : String(b.phone || '')
  if (password.length < 8) return bad('PW_SHORT')
  if (!validDob(dob) || !ident.trim()) return bad('RESET_FAIL')
  const db = admin()
  const { data: uid, error } = await db.rpc('reset_verify', { p_kind: kind, p_ident: ident, p_dob: dob })
  if (error || !uid) return bad(/RESET_LOCKED/.test(error?.message || '') ? 'RESET_LOCKED' : 'RESET_FAIL')
  const { error: ue } = await db.auth.admin.updateUserById(String(uid), { password })
  if (ue) return bad('GENERIC', 500)
  return NextResponse.json({ ok: true })
}
