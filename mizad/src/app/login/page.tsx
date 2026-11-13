'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase-browser'
import { useLang } from '@/components/Lang'
export default function Login() {
  const { t } = useLang(); const db = sb(); const r = useRouter()
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState('')
  const go = async () => {
    const { data: { user } } = await db.auth.getUser(); if (!user) return
    const { data: p } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    r.push(p?.role === 'super_admin' ? '/admin' : '/dashboard')
  }
  const signIn = async () => { const { error } = await db.auth.signInWithPassword({ email, password: pw }); error ? setMsg(error.message) : go() }
  const signUp = async () => {
    const { error } = await db.auth.signUp({ email, password: pw }); if (error) return setMsg(error.message)
    const { error: e2 } = await db.auth.signInWithPassword({ email, password: pw })
    e2 ? setMsg('Check your email to confirm, then sign in.') : go()
  }
  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>{t('login')}</h2>
        <label>{t('email')}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <label>{t('password')}</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} />
        {msg && <p className="muted" style={{ color: 'var(--red)' }}>{msg}</p>}
        <button className="btn full" onClick={signIn}>{t('login')}</button>
        <button className="btn light full" onClick={signUp}>{t('signup')}</button>
      </div>
    </main>
  )
}
