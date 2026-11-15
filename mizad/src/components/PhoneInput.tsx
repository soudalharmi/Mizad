'use client'
import { useEffect, useState } from 'react'
import { useLang } from './Lang'
import { COUNTRIES, normalizePhone, splitPhone } from '@/lib/phone'

// Country picker (flag + code) and the local number. Always reports the full number, e.g. +971501234567.
// Pasting or typing +971… / 00971… also works and switches the country automatically.
export default function PhoneInput({ value, onChange, autoComplete = 'tel' }: { value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const { lang } = useLang()
  const init = splitPhone(value)
  const [dial, setDial] = useState(init.dial), [local, setLocal] = useState(init.local)
  useEffect(() => { // follow outside changes (e.g. form reset)
    const cur = local ? normalizePhone(local, dial) : ''
    if ((value || '') !== cur) { const s = splitPhone(value, dial); if (value) { setDial(s.dial); setLocal(s.local) } else setLocal('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const emit = (d: string, l: string) => onChange(l.replace(/\D/g, '') ? normalizePhone(l, d) : '')
  const typed = (raw: string) => {
    const t = raw.trim()
    if (t.startsWith('+') || t.replace(/\s/g, '').startsWith('00')) { // full international number typed or pasted
      const s = splitPhone(normalizePhone(t), dial); setDial(s.dial); setLocal(s.local); onChange(normalizePhone(t)); return
    }
    const l = t.replace(/[^\d\s]/g, ''); setLocal(l); emit(dial, l)
  }
  return (
    <div dir="ltr" style={{ display: 'flex', gap: 8 }}>
      <select aria-label={lang === 'ar' ? 'رمز الدولة' : 'Country code'} value={dial} onChange={e => { setDial(e.target.value); emit(e.target.value, local) }}
        style={{ width: 118, flexShrink: 0, paddingInline: 8 }}>
        {COUNTRIES.map(c => <option key={c.iso} value={c.dial}>{c.flag} +{c.dial}  {lang === 'ar' ? c.ar : c.en}</option>)}
      </select>
      <input dir="ltr" inputMode="tel" autoComplete={autoComplete} placeholder={dial === '971' ? '50 123 4567' : ''} value={local} onChange={e => typed(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
    </div>
  )
}
