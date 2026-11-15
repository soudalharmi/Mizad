'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLang } from '@/components/Lang'
import { fmt as fmt0 } from '@/lib/money'
const fmt = (n: number, l: string) => fmt0(n, l, 'AED')

export default function AdminClient({ overview: o, settings, outstanding = [] }: any) {
  const { t, lang } = useLang(); const r = useRouter(); const [s, setS] = useState(settings), [msg, setMsg] = useState('')
  const post = async (body: any) => { const j = await (await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); setMsg(j.error || '✓'); r.refresh() }
  // Admin types amounts in AED (e.g. 2.5); they are stored as fils (x100) without floating-point drift.
  const [aed, setAed] = useState<Record<string, string>>(() => Object.fromEntries(['activation_fee_fils', 'item_fee_fils', 'min_session_fee_fils', 'billing_threshold_fils'].map(k => [k, String((settings?.[k] || 0) / 100)])))
  const toFils = (x: string) => { const [a, b = ''] = String(x || '0').trim().split('.'); return (parseInt(a || '0', 10) || 0) * 100 + (parseInt((b + '00').slice(0, 2), 10) || 0) }
  const money = (k: string) => <input inputMode="decimal" value={aed[k] ?? ''} onChange={e => { const val = e.target.value.replace(/[^0-9.]/g, ''); setAed({ ...aed, [k]: val }); setS({ ...s, [k]: toFils(val) }) }} />
  const stat = (l: string, v: any) => <div className="stat"><span className="muted">{l}</span><b>{v}</b></div>
  return (
    <main className="wrap">
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {stat(t('vendors'), o.vendors)}{stat(t('active_vendors'), o.active_vendors)}{stat(t('bidders'), o.bidders)}
        {stat(t('items'), o.items)}{stat(t('chargeable'), o.chargeable_items)}{stat(t('outstanding'), fmt(o.outstanding_fils, lang))}
        {stat(t('activation_rev'), fmt(o.activation_revenue_fils, lang))}{stat(t('fee_rev'), fmt(o.service_fee_revenue_fils, lang))}
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
              <td><span className={'pill ' + (v.status === 'active' ? 'green' : 'gold')}>{v.status}</span></td>
              <td>{v.status === 'active' && <button className="btn red" onClick={() => post({ action: 'vendor', id: v.id, status: 'suspended' })}>{t('suspend')}</button>}
                {v.status === 'suspended' && <button className="btn green" onClick={() => post({ action: 'vendor', id: v.id, status: 'active' })}>{t('reactivate')}</button>}</td></tr>))}</tbody></table>
        </div>
        <div className="card"><h3>{t('settings')}</h3>
          <label>{t('activation_fee')} ({lang === 'ar' ? 'درهم' : 'AED'})</label>{money('activation_fee_fils')}
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
      <div className="card" style={{ marginTop: 18 }}><h3>{t('payments')}</h3>
        <table className="tbl"><tbody>{o.payments.map((p: any) => (<tr key={p.id}><td>{new Date(p.created_at).toLocaleString()}</td><td>{p.kind}</td><td>{fmt(p.amount_fils, lang)}</td><td>{p.status}</td></tr>))}</tbody></table></div>
    </main>
  )
}
