'use client'
import Link from 'next/link'
import { useState } from 'react'
import { sb } from '@/lib/supabase-browser'
import { useLang } from './Lang'
import TermsNotice from './TermsNotice'
import PhoneInput from './PhoneInput'
import { normalizePhone } from '@/lib/phone'

// Platform account for bidders.
// Sign up: nickname + phone + date of birth + password. Sign in: phone + password.
// Forgot password: phone + date of birth + new password.
// allowSignup=false (used on host pages) shows only sign-in plus a link to the platform sign-up page.
export default function BidderAuth({ onDone, allowSignup = true, startMode = 'in', next = '/' }: { onDone: () => void; allowSignup?: boolean; startMode?: 'in' | 'up'; next?: string }) {
  const { t } = useLang(); const db = sb()
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>(allowSignup ? startMode : 'in')
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [dob, setDob] = useState(''), [pw, setPw] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const norm = (p: string) => normalizePhone(p)
  const tr = (c: string) => (t(c) === c ? t('GENERIC') : t(c))
  const post = async (url: string, body: any) => { try { return await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() } catch { return { error: 'GENERIC' } } }

  const signIn = async () => {
    setBusy(true); setErr('')
    const { error } = await db.auth.signInWithPassword({ phone: norm(phone), password: pw })
    setBusy(false); error ? setErr(t('BAD_LOGIN')) : onDone()
  }
  const signUp = async () => {
    if (!name.trim()) return setErr(t('NAME_REQUIRED'))
    if (!dob) return setErr(t('BAD_DOB'))
    if (pw.length < 8) return setErr(t('PW_SHORT'))
    setBusy(true); setErr('')
    const j = await post('/api/auth/register', { kind: 'bidder', nickname: name.trim(), phone: norm(phone), dob, password: pw })
    if (j.error) { setBusy(false); return setErr(tr(j.error)) }
    const { error } = await db.auth.signInWithPassword({ phone: norm(phone), password: pw })
    setBusy(false); error ? setErr(t('BAD_LOGIN')) : onDone()
  }
  const reset = async () => {
    if (!dob) return setErr(t('BAD_DOB'))
    if (pw.length < 8) return setErr(t('PW_SHORT'))
    setBusy(true); setErr('')
    const j = await post('/api/auth/reset', { kind: 'bidder', phone: norm(phone), dob, password: pw })
    if (j.error) { setBusy(false); return setErr(tr(j.error)) }
    const { error } = await db.auth.signInWithPassword({ phone: norm(phone), password: pw })
    setBusy(false); error ? (setMode('in'), setErr(t('reset_ok'))) : onDone()
  }
  const switchTo = (m: 'in' | 'up' | 'reset') => { setMode(m); setErr(''); setPw('') }

  return (
    <div>
      {allowSignup && mode !== 'reset' && <div className="row" style={{ gap: 8 }}>
        <button className={'btn ' + (mode === 'in' ? '' : 'light')} style={{ flex: 1 }} onClick={() => switchTo('in')}>{t('signin')}</button>
        <button className={'btn ' + (mode === 'up' ? '' : 'light')} style={{ flex: 1 }} onClick={() => switchTo('up')}>{t('create_account')}</button>
      </div>}
      {mode === 'reset' && <h3 style={{ marginBottom: 4 }}>{t('reset_pw')}</h3>}
      {mode === 'reset' && <p className="muted" style={{ marginTop: 0 }}>{t('reset_hint_bidder')}</p>}
      {mode === 'up' && <><label>{t('nickname')}</label><input value={name} maxLength={40} onChange={e => setName(e.target.value)} /></>}
      <label>{t('phone')}</label><PhoneInput value={phone} onChange={setPhone} />
      {mode !== 'in' && <><label>{t('dob')}</label><input type="date" dir="ltr" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={e => setDob(e.target.value)} /></>}
      <label>{mode === 'reset' ? t('new_password') : t('password')}</label>
      <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={e => setPw(e.target.value)} />
      {err && <p className="muted" style={{ color: 'var(--red)' }}>{err}</p>}
      <button className="btn gold full" disabled={busy || !phone || !pw} onClick={mode === 'in' ? signIn : mode === 'up' ? signUp : reset}>
        {mode === 'in' ? t('signin') : mode === 'up' ? t('create_account') : t('reset_pw')}</button>
      {mode === 'in' && <p style={{ textAlign: 'center', margin: '10px 0 0' }}><a href="#" onClick={e => { e.preventDefault(); switchTo('reset') }}>{t('forgot_pw')}</a></p>}
      {mode === 'reset' && <p style={{ textAlign: 'center', margin: '10px 0 0' }}><a href="#" onClick={e => { e.preventDefault(); switchTo('in') }}>{t('back_btn')}</a></p>}
      {mode === 'up' && <TermsNotice />}
      {!allowSignup && mode === 'in' && <p className="muted" style={{ textAlign: 'center' }}>{t('no_account')} <Link href={'/signup?next=' + encodeURIComponent(next)}>{t('create_platform')}</Link></p>}
    </div>
  )
}
