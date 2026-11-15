'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sb } from '@/lib/supabase-browser'
import { useLang } from '@/components/Lang'
import TermsNotice from '@/components/TermsNotice'
import PhoneInput from '@/components/PhoneInput'
import { slugify } from '@/lib/slug'
import { CURRENCIES, currencyLabel } from '@/lib/currency'

// Hosts (and the platform admin) sign in with email + password.
// Sign up: email, auction name (becomes the page link), phone, password, date of birth.
// Forgot password: email + date of birth + new password.
export default function Login() {
  const { t, lang } = useLang(); const db = sb(); const r = useRouter()
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [aname, setAname] = useState(''), [phone, setPhone] = useState(''), [dob, setDob] = useState(''), [cur, setCur] = useState('AED')
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { if (new URLSearchParams(location.search).get('mode') === 'up') setMode('up') }, [])
  const tr = (c: string) => (t(c) === c ? t('GENERIC') : t(c))
  const post = async (url: string, body: any) => { try { return await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() } catch { return { error: 'GENERIC' } } }
  const go = async () => {
    const { data: { user } } = await db.auth.getUser(); if (!user) return
    const { data: p } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    r.push(p?.role === 'super_admin' ? '/admin' : '/dashboard')
  }
  const signIn = async () => { setBusy(true); setMsg(''); const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: pw }); setBusy(false); error ? setMsg(t('BAD_LOGIN_EMAIL')) : go() }
  const signUp = async () => {
    if (!aname.trim()) return setMsg(t('NAME_REQUIRED'))
    if (!dob) return setMsg(t('BAD_DOB'))
    if (pw.length < 8) return setMsg(t('pw_min'))
    setBusy(true); setMsg('')
    const j = await post('/api/auth/register', { kind: 'host', email: email.trim(), auctionName: aname.trim(), phone, dob, password: pw, currency: cur })
    if (j.error) { setBusy(false); return setMsg(tr(j.error)) }
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: pw }); setBusy(false)
    error ? setMsg(t('BAD_LOGIN_EMAIL')) : go()
  }
  const reset = async () => {
    if (!dob) return setMsg(t('BAD_DOB'))
    if (pw.length < 8) return setMsg(t('pw_min'))
    setBusy(true); setMsg('')
    const j = await post('/api/auth/reset', { kind: 'host', email: email.trim(), phone, dob, password: pw })
    if (j.error) { setBusy(false); return setMsg(tr(j.error)) }
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: pw }); setBusy(false)
    error ? (setMode('in'), setMsg(t('reset_ok'))) : go()
  }
  const switchTo = (m: 'in' | 'up' | 'reset') => { setMode(m); setMsg(''); setPw('') }
  const preview = aname.trim() ? slugify(aname) : ''

  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>{mode === 'in' ? t('host_login_title') : mode === 'up' ? t('host_signup') : t('reset_pw')}</h2>
        {mode === 'reset' && <p className="muted">{t('reset_hint_host')}</p>}
        <label>{t('email')}</label><input type="email" dir="ltr" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        {mode === 'up' && <>
          <label>{t('store_name')}</label><input value={aname} maxLength={60} onChange={e => setAname(e.target.value)} />
          {preview && <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{t('your_link')}: <span dir="ltr">mazadboss.netlify.app/{preview}</span></p>}
        </>}
        {mode !== 'in' && <><label>{t('phone')}</label><PhoneInput value={phone} onChange={setPhone} /></>}
        {mode === 'up' && <>
          <label>{t('currency')}</label><select value={cur} onChange={e => setCur(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{currencyLabel(c, lang)}</option>)}</select>
          <div className="notice" style={{ marginTop: 8, fontSize: 13 }}>⚠ {t('currency_final')}</div>
        </>}
        {mode !== 'in' && <><label>{t('dob')}</label><input type="date" dir="ltr" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={e => setDob(e.target.value)} /></>}
        <label>{mode === 'reset' ? t('new_password') : t('password')}</label>
        <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={e => setPw(e.target.value)} />
        {msg && <p className="muted" style={{ color: msg === t('reset_ok') ? 'var(--green, #2f7a4d)' : 'var(--red)' }}>{msg}</p>}
        <button className="btn gold full" disabled={busy || !email || !pw || (mode !== 'in' && !phone) || (mode === 'up' && !aname)} onClick={mode === 'in' ? signIn : mode === 'up' ? signUp : reset}>
          {mode === 'in' ? t('login') : mode === 'up' ? t('host_signup') : t('reset_pw')}</button>
        {mode === 'in' && <p style={{ textAlign: 'center', margin: '10px 0 0' }}><a href="#" onClick={e => { e.preventDefault(); switchTo('reset') }}>{t('forgot_pw')}</a></p>}
        {mode === 'up' && <TermsNotice />}
        {mode !== 'reset'
          ? <p className="muted" style={{ textAlign: 'center' }}>{mode === 'in' ? t('no_account') : t('have_account')} <a href="#" onClick={e => { e.preventDefault(); switchTo(mode === 'in' ? 'up' : 'in') }}>{mode === 'in' ? t('host_signup') : t('login')}</a></p>
          : <p style={{ textAlign: 'center' }}><a href="#" onClick={e => { e.preventDefault(); switchTo('in') }}>{t('back_btn')}</a></p>}
        <p style={{ textAlign: 'center' }}><Link href="/">←</Link></p>
      </div>
    </main>
  )
}
