'use client'
import { useEffect, useState } from 'react'
import { useLang } from './Lang'
import { isStandalone, isIOS, snoozed, snooze } from '@/lib/device'

const toKey = (b64: string) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)) }

async function subscribe(lang: string) {
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { key } = await (await fetch('/api/push/key')).json()
    if (!key) throw new Error('NO_KEY')
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) })
  }
  const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON(), lang }) })
  if (!r.ok) throw new Error('SAVE_FAILED')
}

// "Tell me when I'm outbid": shown to signed-in bidders on the live page.
// iPhone only allows website notifications from the Home Screen app, so there it explains that first.
export default function NotifyPrompt() {
  const { t, lang } = useLang()
  const [state, setState] = useState<'' | 'ask' | 'ios_first' | 'done' | 'error'>(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!ok) { if (isIOS() && !isStandalone() && !snoozed('pwa_notify_snooze')) setState('ios_first'); return }
    if (Notification.permission === 'granted') { subscribe(lang).catch(() => {}); return } // keep this phone registered, silently
    if (Notification.permission === 'default' && !snoozed('pwa_notify_snooze')) setState('ask')
  }, [lang])
  if (!state || state === 'done') return state === 'done' ? <div className="notice" style={{ marginTop: 0 }}>{t('notify_done')}</div> : null
  const turnOn = async () => {
    setBusy(true)
    try { const p = await Notification.requestPermission(); if (p === 'granted') { await subscribe(lang); setState('done') } else { snooze('pwa_notify_snooze', 30); setState('') } }
    catch { setState('error') } finally { setBusy(false) }
  }
  return (
    <div className="card section" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ width: 44, height: 44, borderRadius: 11, background: '#f7f0e4', color: '#88632e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{t('notify_title')}</b>
        <div className="muted" style={{ marginTop: 4, lineHeight: 1.6 }}>{state === 'ios_first' ? t('notify_ios_first') : state === 'error' ? t('notify_error') : t('notify_text')}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {state === 'ask' && <button className="btn gold" disabled={busy} onClick={turnOn}>{t('notify_on')}</button>}
          <button className="btn light" onClick={() => { snooze('pwa_notify_snooze'); setState('') }}>{t('pwa_later')}</button>
        </div>
      </div>
    </div>
  )
}
