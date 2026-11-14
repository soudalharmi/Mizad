'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sb } from '@/lib/supabase-browser'
import { useLang } from '@/components/Lang'

// Hosts (and the platform admin) use email + password.
export default function Login() {
  const { t } = useLang(); const db = sb(); const r = useRouter()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { if (new URLSearchParams(location.search).get('mode') === 'up') setMode('up') }, [])
  const go = async () => {
    const { data: { user } } = await db.auth.getUser(); if (!user) return
    const { data: p } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    r.push(p?.role === 'super_admin' ? '/admin' : '/dashboard')
  }
  const signIn = async () => { setBusy(true); setMsg(''); const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: pw }); setBusy(false); error ? setMsg(error.message) : go() }
  const signUp = async () => {
    if (pw.length < 8) return setMsg(t('pw_min'))
    setBusy(true); setMsg('')
    const { error } = await db.auth.signUp({ email: email.trim(), password: pw }); if (error) { setBusy(false); return setMsg(error.message) }
    const { error: e2 } = await db.auth.signInWithPassword({ email: email.trim(), password: pw }); setBusy(false)
    e2 ? setMsg('Check your email to confirm, then sign in.') : go()
  }
  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>{mode === 'in' ? t('host_login_title') : t('host_signup')}</h2>
        {mode === 'up' && <p className="muted">{t('host_signup_hint')}</p>}
        <label>{t('email')}</label><input type="email" dir="ltr" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        <label>{t('password')}</label><input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={e => setPw(e.target.value)} />
        {msg && <p className="muted" style={{ color: 'var(--red)' }}>{msg}</p>}
        <button className="btn gold full" disabled={busy || !email || !pw} onClick={mode === 'in' ? signIn : signUp}>{mode === 'in' ? t('login') : t('host_signup')}</button>
        <p className="muted" style={{ textAlign: 'center' }}>{mode === 'in' ? t('no_account') : t('have_account')} <a href="#" onClick={e => { e.preventDefault(); setMode(mode === 'in' ? 'up' : 'in'); setMsg('') }}>{mode === 'in' ? t('host_signup') : t('login')}</a></p>
        <p style={{ textAlign: 'center' }}><Link href="/">←</Link></p>
      </div>
    </main>
  )
}
