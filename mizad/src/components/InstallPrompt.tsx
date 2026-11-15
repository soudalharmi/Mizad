'use client'
import { useEffect, useState } from 'react'
import { useLang } from './Lang'
import { isStandalone, isIOS, inAppBrowser, isMobile, snoozed, snooze } from '@/lib/device'

// "Add MazadBoss to your Home Screen": Android gets an Install button, iPhone gets the two-step Share hint,
// and TikTok/Instagram's built-in browser gets a hint to open the page in Safari or Chrome first.
export default function InstallPrompt() {
  const { t } = useLang()
  const [mode, setMode] = useState<'' | 'android' | 'ios' | 'inapp'>(''), [evt, setEvt] = useState<any>(null), [copied, setCopied] = useState(false)
  useEffect(() => {
    if (isStandalone() || !isMobile() || snoozed('pwa_install_snooze')) return
    if (inAppBrowser()) { setMode('inapp'); return }
    if (isIOS()) { setMode('ios'); return }
    const h = (e: any) => { e.preventDefault(); setEvt(e); setMode('android') }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  if (!mode) return null
  const close = () => { snooze('pwa_install_snooze'); setMode('') }
  const install = async () => { try { evt?.prompt(); const r = await evt?.userChoice; if (r?.outcome === 'accepted') setMode('') } catch {} }
  const copy = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true) } catch {} }
  return (
    <div className="card section" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 11, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{t('pwa_title')}</b>
        <div className="muted" style={{ marginTop: 4, lineHeight: 1.6 }}>
          {mode === 'android' && t('pwa_android')}
          {mode === 'ios' && <>{t('pwa_ios_1')} <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={t('pwa_share')} style={{ verticalAlign: '-2px' }}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg> {t('pwa_ios_2')}</>}
          {mode === 'inapp' && t('pwa_inapp')}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {mode === 'android' && <button className="btn gold" onClick={install}>{t('pwa_install')}</button>}
          {mode === 'inapp' && <button className="btn gold" onClick={copy}>{copied ? t('copied') : t('pwa_copy')}</button>}
          <button className="btn light" onClick={close}>{t('pwa_later')}</button>
        </div>
      </div>
    </div>
  )
}
