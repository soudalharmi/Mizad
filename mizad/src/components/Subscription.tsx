'use client'
import { useEffect, useState } from 'react'
import { fmt } from '@/lib/money'

// Host subscription: status with days remaining, plan picker with discount code, and payment history.
// Prices always come from the server (sub_quote), never from the browser.
const DAY = 86400000
export function daysLeft(until?: string | null) { return until ? Math.max(0, Math.ceil((+new Date(until) - Date.now()) / DAY)) : 0 }

export default function Subscription({ lang, locked, onClose }: { lang: string; locked?: boolean; onClose?: () => void }) {
  const L = (a: string, e: string) => (lang === 'ar' ? a : e)
  const M = (f: number) => fmt(Number(f || 0), lang, 'AED')
  const fd = (d?: string) => (d ? new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
  const [s, setS] = useState<any>(null), [pick, setPick] = useState(0), [code, setCode] = useState(''), [quote, setQuote] = useState<any>(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { fetch('/api/vendor/subscription').then(r => r.json()).then(j => { if (j.ok) { setS(j); setPick(j.plans.find((p: any) => p.months === 12)?.months || j.plans[0]?.months || 0) } }).catch(() => {}) }, [])
  useEffect(() => { setQuote(null); setErr('') }, [pick])
  if (!s) return <div className="card"><div className="empty">…</div></div>
  const plan = s.plans.find((p: any) => p.months === pick)
  const shown = quote && quote.months === pick ? quote : plan
  const left = daysLeft(s.sub_until), active = s.status === 'active' && left > 0
  const cur = s.history.find((h: any) => new Date(h.starts_at) <= new Date() && new Date(h.ends_at) > new Date()) || s.history[0]
  const onTrial = cur?.kind === 'trial'
  const total = cur ? Math.max(1, (+new Date(s.sub_until || cur.ends_at) - +new Date(cur.starts_at)) / DAY) : 30
  const pct = Math.min(100, Math.max(0, (left / total) * 100))
  const name = (m: number) => m === 12 ? L('سنة', '1 year') : m === 1 ? L('شهر', '1 month') : lang === 'ar' ? `${m} أشهر` : `${m} months`
  const apply = async () => {
    if (!code.trim()) return
    setBusy(true); setErr('')
    const j = await (await fetch('/api/vendor/subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ months: pick, code: code.trim() }) })).json().catch(() => ({}))
    setBusy(false)
    if (j.ok) setQuote(j.quote); else { setQuote(null); setErr(j.error === 'CODE_INVALID' ? L('الكود غير صالح أو منتهي أو لا ينطبق على هذه الباقة', 'This code is not valid, has expired, or does not apply to this plan') : L('تعذر التحقق من الكود', 'Could not check the code')) }
  }
  const pay = async () => {
    setBusy(true); setErr('')
    const j = await (await fetch('/api/vendor/pay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'subscription', months: pick, code: quote ? code.trim() : '' }) })).json().catch(() => ({}))
    if (j.url) { location.href = j.url; return }
    setBusy(false); setErr(j.error === 'CODE_INVALID' ? L('الكود غير صالح', 'Invalid code') : j.error === 'PAY_MIN' ? L('المبلغ أقل من الحد الأدنى للدفع (2 درهم)', 'Amount is below the AED 2 payment minimum') : L('تعذر بدء الدفع', 'Could not start the payment') + (j.detail ? ` (${j.detail})` : ''))
  }
  const trial = async () => {
    setBusy(true); setErr('')
    const j = await (await fetch('/api/vendor/subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'trial' }) })).json().catch(() => ({}))
    if (j.ok) { location.href = '/dashboard'; return }
    setBusy(false); setErr(j.error === 'TRIAL_USED' ? L('استخدمت التجربة المجانية من قبل. اختر باقة للمتابعة.', 'You already used the free trial. Choose a plan to continue.') : L('تعذر بدء التجربة', 'Could not start the trial'))
  }
  const label = (h: any) => ({ paid: L('اشتراك مدفوع', 'Paid'), trial: L('تجربة مجانية', 'Free trial'), admin: L('مُنح من الإدارة', 'Given by admin'), free: L('مجاني بكود خصم', 'Free with code') } as any)[h.kind] || h.kind
  return (
    <div className="subwrap">
      <div className={'card subhead ' + (active ? (left <= 7 ? 'warn' : 'ok') : 'bad')}>
        {onClose && <button className="btn light" style={{ float: lang === 'ar' ? 'left' : 'right', padding: '4px 10px' }} onClick={onClose}>✕</button>}
        <span className="muted">{L('اشتراكك', 'Your subscription')}</span>
        {active ? <>
          <h2 style={{ margin: '4px 0 2px' }}>{onTrial ? L('تجربة مجانية', 'Free trial') : L('اشتراك فعّال', 'Active')}</h2>
          <div className="subdays"><b>{left}</b><span>{left === 1 ? L('يوم متبقٍ', 'day left') : L('يوماً متبقياً', 'days left')}</span></div>
          <div className="subbar"><i style={{ width: pct + '%' }} /></div>
          <div className="row" style={{ fontSize: 13 }}><span className="muted">{L('ينتهي في', 'Ends on')}</span><b>{fd(s.sub_until)}</b></div>
          {left <= 7 && <div className="notice" style={{ marginTop: 10 }}>{L('اشتراكك يقترب من الانتهاء. جدّد الآن حتى لا يتوقف حسابك ومزاداتك.', 'Your subscription ends soon. Renew now so your account and auctions keep running.')}</div>}
        </> : <>
          <h2 style={{ margin: '4px 0 6px' }}>{s.status === 'pending_activation' ? L('اختر باقتك للبدء', 'Choose a plan to start') : L('انتهى اشتراكك', 'Your subscription has ended')}</h2>
          <p className="muted" style={{ margin: 0 }}>{s.status === 'pending_activation' ? L('اشترك لتفعيل صفحة مزادك ولوحة التحكم.', 'Subscribe to activate your auction page and dashboard.') : L('لوحة التحكم وصفحة مزادك متوقفتان حتى التجديد. بياناتك محفوظة كما هي.', 'Your dashboard and auction page are paused until you renew. Your data is kept as it is.')}</p>
        </>}
      </div>

      {!active && s.trial_available && <div className="card subtrial">
        <span className="save">{L('مجاناً', 'Free')}</span>
        <h3 style={{ margin: '0 0 4px' }}>{L(`جرّب مجاناً ${s.trial_days} أيام`, `Try it free for ${s.trial_days} days`)}</h3>
        <p className="muted" style={{ margin: '0 0 12px' }}>{L('كل المزايا متاحة خلال التجربة، بدون دفع. بعدها تختار الباقة التي تناسبك.', 'Every feature is open during the trial, no payment needed. Afterwards you pick the plan that suits you.')}</p>
        <button className="btn gold full" style={{ marginTop: 0 }} disabled={busy} onClick={trial}>{busy ? '…' : L('ابدأ التجربة المجانية', 'Start the free trial')}</button>
        <div className="muted" style={{ textAlign: 'center', marginTop: 10, fontSize: 12 }}>{L('أو اختر باقة مدفوعة بالأسفل', 'or choose a paid plan below')}</div></div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{active ? L('تمديد الاشتراك', 'Extend your subscription') : L('اختر الباقة', 'Choose a plan')}</h3>
        {active && <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>{L('المدة الجديدة تُضاف بعد نهاية اشتراكك الحالي، فلا تخسر أي يوم.', 'The new period is added after your current one ends, so you lose no days.')}</p>}
        <div className="plans">{s.plans.map((p: any) => (
          <button key={p.months} className={'plan' + (pick === p.months ? ' on' : '')} onClick={() => setPick(p.months)}>
            {Number(p.plan_pct) > 0 && <span className="save">{L('وفّر', 'Save')} {Number(p.plan_pct)}%</span>}
            <b>{name(p.months)}</b>
            <span className="price">{M(p.total)}</span>
            {Number(p.plan_pct) > 0 ? <s className="muted">{M(p.list)}</s> : <span className="muted">&nbsp;</span>}
            <small className="muted">{M(Math.round(p.total / p.months))} / {L('شهر', 'month')}</small>
          </button>))}</div>
        <label>{L('كود الخصم (اختياري)', 'Discount code (optional)')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input dir="ltr" value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setQuote(null) }} placeholder="CODE" style={{ textTransform: 'uppercase' }} />
          <button className="btn light" disabled={busy || !code.trim()} onClick={apply}>{L('تطبيق', 'Apply')}</button></div>
        {shown && <div className="subsum">
          <div className="row"><span>{name(shown.months)} × {M(Math.round(shown.list / shown.months))}</span><b>{M(shown.list)}</b></div>
          {Number(shown.plan_off) > 0 && <div className="row"><span>{L('خصم الباقة', 'Plan discount')} {Number(shown.plan_pct)}%</span><b>− {M(shown.plan_off)}</b></div>}
          {quote && Number(quote.code_off) > 0 && <div className="row" style={{ color: 'var(--green, #2e9e5b)' }}><span>{L('كود', 'Code')} <b dir="ltr">{quote.code}</b></span><b>− {M(quote.code_off)}</b></div>}
          <div className="row tot"><span>{L('الإجمالي', 'Total')}</span><b>{M(shown.total)}</b></div></div>}
        {err && <div className="notice" style={{ marginTop: 10 }}>{err}</div>}
        <button className="btn gold full" style={{ marginTop: 12 }} disabled={busy || !plan} onClick={pay}>
          {busy ? '…' : shown && Number(shown.total) === 0 ? L('تفعيل مجاناً', 'Activate for free') : `${L('ادفع', 'Pay')} ${M(shown?.total || 0)}`}</button>
        <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginBottom: 0 }}>{L('الدفع آمن عبر Ziina. رسوم المنتجات والجلسات تبقى كما هي.', 'Secure payment via Ziina. Product and session fees stay as they are.')}</p>
      </div>

      {s.history.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>{L('سجل الاشتراك', 'Subscription history')}</h3>
        {s.history.map((h: any, i: number) => <div className="row" key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--line, #e6e2d9)', alignItems: 'flex-start' }}>
          <div><b>{label(h)}</b>{h.months ? ` · ${name(h.months)}` : h.days ? ` · ${h.days} ${L('يوم', 'days')}` : ''}{h.code ? <> · <span dir="ltr">{h.code}</span></> : null}<br /><small className="muted">{fd(h.starts_at)} → {fd(h.ends_at)}</small></div>
          <b>{h.amount_fils ? M(h.amount_fils) : L('مجاني', 'Free')}</b></div>)}</div>}
      {locked && <p className="muted" style={{ textAlign: 'center', fontSize: 12 }}>{L('حسابات المزايدين مجانية دائماً.', 'Bidder accounts are always free.')}</p>}
    </div>
  )
}
