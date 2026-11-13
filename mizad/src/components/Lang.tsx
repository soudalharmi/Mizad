'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { dict } from '@/lib/i18n'
const C = createContext<any>(null)
export const useLang = () => useContext(C)
export function LangProvider({ children }: any) {
  const [lang, set] = useState<'ar' | 'en'>('ar')
  useEffect(() => { const l = localStorage.getItem('lang'); if (l === 'en' || l === 'ar') set(l) }, [])
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr' }, [lang])
  const setLang = (l: 'ar' | 'en') => { localStorage.setItem('lang', l); set(l) }
  const t = (k: string) => (dict as any)[lang][k] ?? k
  return <C.Provider value={{ lang, t, setLang }}>{children}</C.Provider>
}
