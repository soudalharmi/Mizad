'use client'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { useCallback, useEffect, useState } from 'react'
import { sb } from '@/lib/supabase-browser'
import { useLang } from '@/components/Lang'
import BidderAuth from '@/components/BidderAuth'
import Profile from '@/components/Profile'

export default function Home() {
  const { t } = useLang(); const db = sb()
  const [user, setUser] = useState<any>(null), [ready, setReady] = useState(false), [prof, setProf] = useState(false)
  const load = useCallback(async () => { const { data: { user: u } } = await db.auth.getUser(); setUser(u); setReady(true) }, [])
  useEffect(() => { load() }, [load])
  return (
    <main className="wrap" style={{ maxWidth: 520 }}>
      <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ width: 132, height: 132, borderRadius: 32, background: '#20211f', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 10px' }}><Logo size={112} title="Mazad Boss" /></div>
        <div dir="ltr" style={{ fontSize: 26, fontWeight: 700, color: '#20211f', marginBottom: 4 }}>Mazad <span style={{ color: '#a77b3c' }}>Boss</span></div>
        <h2>{t('home_title')}</h2>
        <p className="muted" style={{ lineHeight: 1.7 }}>{t('home_text')}</p>
      </div>
      {ready && (user && !user.phone ? (
        <div className="card section" style={{ textAlign: 'center' }}>
          <h3>{t('host_section')}</h3>
          <Link href="/dashboard"><button className="btn gold full">{t('dashboard')}</button></Link>
        </div>
      ) : (
        <div className="card section" style={{ textAlign: 'start' }}>
          <h3>{t('bidders_title')}</h3>
          {user?.phone ? <button className="btn gold full" onClick={() => setProf(true)}>{t('my_profile')}</button>
            : <BidderAuth onDone={load} />}
        </div>))}
      <Link href="/explore"><button className="btn gold full section">{t('explore')}</button></Link>
      {!(user && !user.phone) && <div className="card" style={{ textAlign: 'center' }}>
        <h3>{t('host_section')}</h3>
        <p className="muted">{t('home_vendor')}</p>
        <Link href="/login?mode=up"><button className="btn full">{t('host_signup')}</button></Link>
        <p className="muted" style={{ margin: '10px 0 0' }}>{t('have_account')} <Link href="/login">{t('host_login')}</Link></p>
      </div>}
      <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}><Link href="/terms">{t('terms_link')}</Link></p>
      {prof && <Profile onClose={() => { setProf(false); load() }} />}
    </main>
  )
}
