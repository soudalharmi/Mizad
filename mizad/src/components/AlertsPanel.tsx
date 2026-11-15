'use client'
import { useEffect, useState } from 'react'
import { useLang } from './Lang'
import { enablePush } from './NotifyPrompt'
import { isIOS, isStandalone } from '@/lib/device'

// Profile section: shows whether outbid alerts are on for this phone, turns them on, and sends a test with a clear report.
export default function AlertsPanel() {
  const { t, lang } = useLang()
  const [st, setSt] = useState(''), [out, setOut] = useState(''), [busy, setBusy] = useState(false)
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  useEffect(() => { setSt(!supported ? (isIOS() && !isStandalone() ? 'ios' : 'unsupported') : Notification.permission) }, [supported])
  const on = async () => {
    setBusy(true); setOut('')
    try { const p = await Notification.requestPermission(); setSt(p); if (p === 'granted') { await enablePush(lang); setOut(t('notify_done')) } }
    catch (e: any) { setOut(t('notify_error') + ' (' + (e?.message || e) + ')') } finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true); setOut('')
    try {
      await enablePush(lang) // make sure this phone is registered
      const j = await (await fetch('/api/push/test', { method: 'POST' })).json()
      if (j.step !== 'sent') setOut(`✕ ${j.step}: ${j.error}`)
      else setOut(j.results.map((r: any) => (r.ok ? '✓ ' : '✕ ') + r.service + (r.status ? ' ' + r.status : '') + (r.error ? ': ' + r.error : '')).join('\n'))
    } catch (e: any) { setOut('✕ ' + (e?.message || e)) } finally { setBusy(false) }
  }
  return (<>
    <h3 style={{ marginTop: 20 }}>{t('alerts_title')}</h3>
    <div className="kv"><span>{t('alerts_status')}</span><b>{st === 'granted' ? t('alerts_on') : st === 'denied' ? t('alerts_blocked') : st === 'ios' ? t('alerts_ios') : st === 'unsupported' ? t('alerts_unsupported') : t('alerts_off')}</b></div>
    {st === 'default' && <button className="btn gold full" style={{ marginTop: 10 }} disabled={busy} onClick={on}>{t('notify_on')}</button>}
    {st === 'granted' && <button className="btn light full" style={{ marginTop: 10 }} disabled={busy} onClick={test}>{busy ? '…' : t('alerts_test')}</button>}
    {st === 'denied' && <p className="muted">{t('alerts_blocked_hint')}</p>}
    {st === 'ios' && <p className="muted">{t('notify_ios_first')}</p>}
    {out && <p className="muted" dir="ltr" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{out}</p>}
  </>)
}
