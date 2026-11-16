'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLang } from '@/components/Lang'
import { fmt as fmt0 } from '@/lib/money'
const fmt = (n: number, l: string) => fmt0(n, l, 'AED')

export default function AdminClient({ overview: o, settings, outstanding = [], plans = [], codes = [], subs = {}, subRev = 0 }: any) {
  const { t, lang } = useLang(); const r = useRouter(); const [s, setS] = useState(settings), [msg, setMsg] = useState('')
  const post = async (body: any) => { const j = await (await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); setMsg(j.error || '✓'); r.refresh() }
  // Admin types amounts in AED (e.g. 2.5); they are stored as fils (x100) without floating-point drift.
  const [aed, setAed] = useState<Record<string, string>>(() => Object.fromEntries(['sub_month_fils', 'item_fee_fils', 'min_session_fee_fils', 'billing_threshold_fils'].map(k => [k, String((settings?.[k] || 0) / 100)])))
  const toFils = (x: string) => { const [a, b = ''] = String(x || '0').trim().split('.'); return (parseInt(a || '0', 10) || 0) * 100 + (parseInt((b + '00').slice(0, 2), 10) || 0) }
  const money = (k: string) => <input inputMode="decimal" value={aed[k] ?? ''} onChange={e => { const val = e.target.value.replace(/[^0-9.]/g, ''); setAed({ ...aed, [k]: val }); setS({ ...s, [k]: toFils(val) }) }} />
  const L = (a: string, e: string) => (lang === 'ar' ? a : e)
  const [pls, setPls] = useState<any[]>(plans.map((p: any) => ({ ...p, discount_pct: String(p.discount_pct) })))
  const blank = { code: '', kind: 'percent', value: '', max_uses: '', valid_until: '', plan_months: '', note: '' }
  const [cf, setCf] = useState<any>(blank), [ext, setExt] = useState<Record<string, string>>({})
  const gen = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(8)); setCf({ ...cf, code: 'MB-' + Array.from(r, x => A[x % A.length]).join('') }) }
  const left = (d?: string) => d ? Math.ceil((+new Date(d) - Date.now()) / 86400000) : null
  const fd = (d?: string) => d ? new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const pname = (m: number) => m === 12 ? L('سنة', '1 year') : m === 1 ? L('شهر', '1 month') : lang === 'ar' ? `${m} أشهر` : `${m} months`
  const stat = (l: string, v: any) => <div className="stat"><span className="muted">{l}</span><b>{v}</b></div>
  return (
    <main className="wrap">
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {stat(t('vendors'), o.vendors)}{stat(t('active_vendors'), o.active_vendors)}{stat(t('bidders'), o.bidders)}
        {stat(t('items'), o.items)}{stat(t('chargeable'), o.chargeable_items)}{stat(t('outstanding'), fmt(o.outstanding_fils, lang))}
        {stat(L('إيرادات الاشتراكات', 'Subscription revenue'), fmt(subRev, lang))}{stat(t('fee_rev'), fmt(o.service_fee_revenue_fils, lang))}
      </div>
      <div className="card" style={{ margin: '18px 0' }}><h3>{t('outstanding_hosts')} ({outstanding.length})</h3>
        {outstanding.length === 0 ? <p className="muted">{t('no_outstanding')}</p> : <div className="bidlist">{outstanding.map((h: any) => (
          <div className="person" key={h.id}><div style={{ minWidth: 0 }}><b>{h.name}</b> <small className="muted" dir="ltr">/{h.slug}</small><br />
            {h.phone ? <a dir="ltr" href={'tel:' + h.phone}>{h.phone}</a> : <small className="muted">{t('host_phone')}: —</small>}<br />
            {h.email && <a dir="ltr" href={'mailto:' + h.email} style={{ wordBreak: 'break-all' }}>{h.email}</a>}</div>
            <b style={{ whiteSpace: 'nowrap' }}>{fmt(h.amount_fils, lang)}</b></div>))}</div>}
      </div>
      <div className="grid">
        <div className="card"><h3>{t('vendors')}</h3>
          <table className="tbl"><tbody>{o.vendors_list.map((v: any) => (
            <tr key={v.id}><td><b>{v.name}</b><br /><small className="muted" dir="ltr">/{v.slug}</small></td><td>{v.items} · {fmt(v.fees_fils, lang)}</td>
              <td><span className={'pill ' + (v.status === 'active' ? 'green' : 'gold')}>{v.status}</span><br /><small className="muted">{subs[v.id] ? <>{fd(subs[v.id])} · {Math.max(0, left(subs[v.id]) || 0)} {L('يوم', 'd')}</> : L('بلا اشتراك', 'no subscription')}</small>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}><input inputMode="numeric" placeholder={L('أيام', 'days')} value={ext[v.id] || ''} onChange={e => setExt({ ...ext, [v.id]: e.target.value.replace(/\D/g, '') })} style={{ width: 64, padding: '5px 7px' }} />
                <button className="btn light" style={{ padding: '5px 8px', fontSize: 12 }} disabled={!ext[v.id]} onClick={() => { post({ action: 'extend', id: v.id, days: Number(ext[v.id]) }); setExt({ ...ext, [v.id]: '' }) }}>+ {L('تمديد', 'Extend')}</button></div></td>
              <td>{v.status === 'active' && <button className="btn red" onClick={() => post({ action: 'vendor', id: v.id, status: 'suspended' })}>{t('suspend')}</button>}
                {v.status === 'suspended' && <button className="btn green" onClick={() => post({ action: 'vendor', id: v.id, status: 'active' })}>{t('reactivate')}</button>}</td></tr>))}</tbody></table>
        </div>
        <div className="card"><h3>{t('settings')}</h3>
          <label>{L('سعر الاشتراك الشهري', 'Monthly subscription price')} ({lang === 'ar' ? 'درهم' : 'AED'})</label>{money('sub_month_fils')}
          <label>{L('أيام التجربة المجانية للمضيف الجديد (0 = بدون تجربة)', 'Free trial days for new hosts (0 = no trial)')}</label>
          <input inputMode="numeric" value={String(s.trial_days ?? 0)} onChange={e => setS({ ...s, trial_days: Number(e.target.value.replace(/\D/g, '') || 0) })} />
          <label>{t('item_fee')} ({lang === 'ar' ? 'درهم' : 'AED'})</label>{money('item_fee_fils')}
          <label>{t('min_session_fee')} ({lang === 'ar' ? 'درهم' : 'AED'})</label>{money('min_session_fee_fils')}
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{t('min_session_fee_hint')}</p>
          <label>{t('billing_mode')}</label><select value={s.billing_mode} onChange={e => setS({ ...s, billing_mode: e.target.value })}>
            <option value="manual">manual</option><option value="per_session">per_session</option><option value="threshold">threshold</option></select>
          <label>{t('threshold')} ({lang === 'ar' ? 'درهم' : 'AED'})</label>{money('billing_threshold_fils')}
          <button className="btn gold full" onClick={() => post({ action: 'settings', values: s })}>{t('save')}</button>
          {msg && <p className="muted">{msg}</p>}
        </div>
      </div>
      <div className="grid" style={{ marginTop: 18 }}>
        <div className="card"><h3>{L('باقات الاشتراك', 'Subscription plans')}</h3>
          <p className="muted" style={{ marginTop: -6 }}>{L('السعر = السعر الشهري × عدد الأشهر − نسبة الخصم. احفظ الإعدادات أولاً إذا غيّرت السعر الشهري.', 'Price = monthly price × months − discount. Save settings first if you changed the monthly price.')}</p>
          {pls.map((p: any, i: number) => { const list = (s.sub_month_fils || 0) * p.months, tot = Math.round(list * (100 - (Number(p.discount_pct) || 0)) / 100)
            return <div key={p.months} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--ink)', fontWeight: 600, minWidth: 96 }}><input type="checkbox" checked={!!p.active} style={{ width: 'auto' }} onChange={e => setPls(pls.map((x, j) => j === i ? { ...x, active: e.target.checked } : x))} />{pname(p.months)}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input inputMode="decimal" value={p.discount_pct} onChange={e => setPls(pls.map((x, j) => j === i ? { ...x, discount_pct: e.target.value.replace(/[^0-9.]/g, '') } : x))} style={{ width: 70, padding: '6px 8px' }} /><span className="muted">%</span></div>
              <b style={{ whiteSpace: 'nowrap' }}>{fmt(tot, lang)}</b></div> })}
          <button className="btn gold full" onClick={() => post({ action: 'plans', plans: pls.map(p => ({ months: p.months, discount_pct: Number(p.discount_pct) || 0, active: !!p.active })) })}>{L('حفظ الباقات', 'Save plans')}</button>
        </div>
        <div className="card codes"><h3>{L('أكواد الخصم', 'Discount codes')} ({codes.length})</h3>
          <label>{L('الكود', 'Code')}</label>
          <div style={{ display: 'flex', gap: 8 }}><input dir="ltr" value={cf.code} onChange={e => setCf({ ...cf, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} placeholder="RAMADAN25" /><button className="btn light" onClick={gen}>{L('توليد', 'Generate')}</button></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label>{L('نوع الخصم', 'Type')}</label><select value={cf.kind} onChange={e => setCf({ ...cf, kind: e.target.value })}><option value="percent">{L('نسبة %', 'Percent %')}</option><option value="fixed">{L('مبلغ ثابت (درهم)', 'Fixed (AED)')}</option></select></div>
            <div><label>{L('القيمة', 'Value')}</label><input inputMode="decimal" value={cf.value} onChange={e => setCf({ ...cf, value: e.target.value.replace(/[^0-9.]/g, '') })} placeholder={cf.kind === 'percent' ? '25' : '100'} /></div>
            <div><label>{L('أقصى عدد استخدامات', 'Max uses')}</label><input inputMode="numeric" value={cf.max_uses} onChange={e => setCf({ ...cf, max_uses: e.target.value.replace(/\D/g, '') })} placeholder={L('بلا حد', 'Unlimited')} /></div>
            <div><label>{L('صالح حتى', 'Valid until')}</label><input type="date" value={cf.valid_until} onChange={e => setCf({ ...cf, valid_until: e.target.value })} /></div>
            <div><label>{L('ينطبق على', 'Applies to')}</label><select value={cf.plan_months} onChange={e => setCf({ ...cf, plan_months: e.target.value })}><option value="">{L('كل الباقات', 'All plans')}</option>{plans.map((p: any) => <option key={p.months} value={p.months}>{pname(p.months)}</option>)}</select></div>
            <div><label>{L('ملاحظة', 'Note')}</label><input value={cf.note} onChange={e => setCf({ ...cf, note: e.target.value })} /></div></div>
          <button className="btn gold full" disabled={!cf.code || !cf.value} onClick={async () => { await post({ action: 'code_save', code: cf }); setCf(blank) }}>{L('إضافة الكود', 'Add code')}</button>
          <div style={{ marginTop: 14 }}>{codes.length === 0 ? <p className="muted">{L('لا توجد أكواد بعد', 'No codes yet')}</p> : codes.map((c: any) => (
            <div className="crow" key={c.id}><div><b dir="ltr">{c.code}</b> <span className={'pill ' + (c.active ? 'green' : '')}>{c.active ? L('فعّال', 'Active') : L('متوقف', 'Off')}</span><br />
              <small className="muted">{c.kind === 'percent' ? `${Number(c.value)}%` : fmt(Number(c.value) * 100, lang)} · {L('استُخدم', 'used')} {c.used_count}{c.max_uses ? `/${c.max_uses}` : ''}{c.valid_until ? ` · ${L('حتى', 'until')} ${fd(c.valid_until)}` : ''}{c.plan_months ? ` · ${pname(c.plan_months)}` : ''}{c.note ? ` · ${c.note}` : ''}</small></div>
              <div style={{ display: 'flex', gap: 6 }}><button className="btn light" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => post({ action: 'code_toggle', id: c.id, active: !c.active })}>{c.active ? L('إيقاف', 'Turn off') : L('تفعيل', 'Turn on')}</button>
                <button className="btn red" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => post({ action: 'code_delete', id: c.id })}>{L('حذف', 'Delete')}</button></div></div>))}</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 18 }}><h3>{t('payments')}</h3>
        <table className="tbl"><tbody>{o.payments.map((p: any) => (<tr key={p.id}><td>{new Date(p.created_at).toLocaleString()}</td><td>{p.kind}</td><td>{fmt(p.amount_fils, lang)}</td><td>{p.status}</td></tr>))}</tbody></table></div>
    </main>
  )
}
