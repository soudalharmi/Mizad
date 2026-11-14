'use client'
import { useRouter } from 'next/navigation'
import BidderAuth from '@/components/BidderAuth'
import { useLang } from '@/components/Lang'

export default function Signup() {
  const { t } = useLang(); const r = useRouter()
  const go = () => { const n = new URLSearchParams(location.search).get('next'); r.push(n && n.startsWith('/') ? n : '/') }
  return (
    <main className="wrap" style={{ maxWidth: 440 }}>
      <div className="card"><h2>{t('create_account')}</h2><p className="muted">{t('platform_hint')}</p>
        <BidderAuth onDone={go} startMode="up" /></div>
    </main>
  )
}
