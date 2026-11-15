'use client'
import Link from 'next/link'
import { useLang } from './Lang'
import Logo from './Logo'
export default function Header() {
  const { lang, setLang, t } = useLang()
  return (
    <header className="top">
      <Link href="/" className="brand" dir="ltr" style={{ color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}><Logo size={42} /><span style={{ color: '#fff' }}>Mazad</span><span>Boss</span></Link>
      <div className="row" style={{ gap: 10 }}>
        <button className="lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'عربي'}</button>
      </div>
    </header>
  )
}
