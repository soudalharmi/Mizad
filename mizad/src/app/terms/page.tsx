'use client'
import Link from 'next/link'
import { useLang } from '@/components/Lang'
import { TERMS, TERMS_UPDATED } from '@/lib/terms'

export default function Terms() {
  const { lang } = useLang(); const T = TERMS[lang === 'ar' ? 'ar' : 'en']
  return (
    <main className="wrap">
      <div className="card">
        <h2>{T.title}</h2>
        <p className="muted">{lang === 'ar' ? 'آخر تحديث' : 'Last updated'}: {TERMS_UPDATED}</p>
        <p>{T.intro}</p>
        {T.secs.map(s => <div key={s.h} style={{ marginTop: 14 }}><h3>{s.h}</h3>{s.p.map((x, i) => <p key={i} style={{ lineHeight: 1.7 }}>{x}</p>)}</div>)}
      </div>
      <p style={{ textAlign: 'center' }}><Link href="/">{lang === 'ar' ? 'العودة للرئيسية' : 'Back to home'}</Link></p>
    </main>
  )
}
