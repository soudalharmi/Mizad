'use client'
import { useState } from 'react'
import { sb } from '@/lib/supabase-browser'
import { useLang } from './Lang'

// One-time sign up (name + phone + password + OTP). Afterwards: phone + password.
export default function BidderAuth({ onDone }: { onDone: () => void }) {
  const { t } = useLang(); const db = sb()
  const [mode, setMode] = useState<'in' | 'up'>('in'), [step, setStep] = useState<'form' | 'otp'>('form')
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [pw, setPw] = useState(''), [code, setCode] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const norm = (p: string) => '+' + p.replace(/\D/g, '')

  const signIn = async () => {
    setBusy(true); setErr('')
    const { error } = await db.auth.signInWithPassword({ phone: norm(phone), password: pw })
    setBusy(false); error ? setErr(t('BAD_LOGIN')) : onDone()
  }
  const signUp = async () => {
    if (!name.trim()) return setErr(t('name'))
    if (pw.length < 8) return setErr(t('PW_SHORT'))
    setBusy(true); setErr('')
    const { error } = await db.auth.signUp({ phone: norm(phone), password: pw, options: { data: { full_name: name.trim() } } })
    setBusy(false); error ? setErr(error.message) : setStep('otp')
  }
  const verify = async () => {
    setBusy(true); setErr('')
    const { error } = await db.auth.verifyOtp({ phone: norm(phone), token: code, type: 'sms' })
    setBusy(false); error ? setErr(error.message) : onDone()
  }
  return (
    <div>
      {step === 'form' && <div className="row" style={{ gap: 8 }}>
        <button className={'btn ' + (mode === 'in' ? '' : 'light')} style={{ flex: 1 }} onClick={() => { setMode('in'); setErr('') }}>{t('signin')}</button>
        <button className={'btn ' + (mode === 'up' ? '' : 'light')} style={{ flex: 1 }} onClick={() => { setMode('up'); setErr('') }}>{t('create_account')}</button>
      </div>}
      {step === 'form' ? (<>
        {mode === 'up' && <><label>{t('name')}</label><input value={name} onChange={e => setName(e.target.value)} /></>}
        <label>{t('phone')}</label><input dir="ltr" inputMode="tel" placeholder="+9715XXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} />
        <label>{t('password')}</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} />
        <button className="btn gold full" disabled={busy || !phone || !pw} onClick={mode === 'in' ? signIn : signUp}>{mode === 'in' ? t('signin') : t('create_account')}</button>
      </>) : (<>
        <label>{t('code')}</label><input dir="ltr" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn gold full" disabled={busy || !code} onClick={verify}>{t('verify')}</button>
      </>)}
      {err && <p className="muted" style={{ color: 'var(--red)' }}>{err}</p>}
    </div>
  )
}
