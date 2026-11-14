'use client'
import Link from 'next/link'
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
        <div style={{ fontSize: 54 }}>📿</div>
        <h2>{t('tagline')}</h2>
        <p className="muted">{t('platform_hint')}</p>
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
      {prof && <Profile onClose={() => { setProf(false); load() }} />}
    </main>
  )
}
