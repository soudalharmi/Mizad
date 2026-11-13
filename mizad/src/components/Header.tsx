'use client'
import Link from 'next/link'
import { useLang } from './Lang'
export default function Header() {
  const { lang, setLang, t } = useLang()
  return (
    <header className="top">
      <Link href="/" className="brand" style={{ color: '#fff', textDecoration: 'none' }}>مِ<span>زاد</span> <small style={{ fontSize: 12, fontWeight: 400 }}>MIZAD</small></Link>
      <div className="row" style={{ gap: 10 }}>
        <small>{t('tagline')}</small>
        <button className="lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'عربي'}</button>
      </div>
    </header>
  )
}
