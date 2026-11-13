'use client'
import Link from 'next/link'
import { useLang } from '@/components/Lang'
export default function Home() {
  const { t } = useLang()
  return (
    <main className="wrap" style={{ maxWidth: 520 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 54 }}>📿</div>
        <h2>{t('tagline')}</h2>
        <p className="muted">{t('home_vendor')}</p>
        <Link href="/login"><button className="btn gold full">{t('login')} / {t('signup')}</button></Link>
      </div>
    </main>
  )
}
