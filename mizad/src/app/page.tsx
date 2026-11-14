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
      {ready && (
        <div className="card section" style={{ textAlign: 'start' }}>
          <h3>{t('for_bidders')}</h3>
          {user?.phone ? <button className="btn gold full" onClick={() => setProf(true)}>{t('my_profile')}</button>
            : user ? <Link href="/dashboard"><button className="btn full">{t('dashboard')}</button></Link>
            : <BidderAuth onDone={load} />}
        </div>)}
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="muted">{t('home_vendor')}</p>
        <Link href="/login"><button className="btn light full">{t('host_login')}</button></Link>
      </div>
      {prof && <Profile onClose={() => { setProf(false); load() }} />}
    </main>
  )
}
