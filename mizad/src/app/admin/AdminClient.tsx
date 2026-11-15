'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLang } from '@/components/Lang'
import { fmt as fmt0 } from '@/lib/money'
const fmt = (n: number, l: string) => fmt0(n, l, 'AED')

export default function AdminClient({ overview: o, settings, outstanding = [] }: any) {
  const { t, lang } = useLang(); const r = useRouter(); const [s, setS] = useState(settings), [msg, setMsg] = useState('')
  const post = async (body: any) => { const j = await (await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); setMsg(j.error || '✓'); r.refresh() }
  const num = (k: string) => (e: any) => setS({ ...s, [k]: parseInt(e.target.value || '0', 10) })
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
          <label>{t('activation_fee')}</label><input type="number" value={s.activation_fee_fils} onChange={num('activation_fee_fils')} />
          <label>{t('item_fee')}</label><input type="number" value={s.item_fee_fils} onChange={num('item_fee_fils')} />
          <label>{t('billing_mode')}</label><select value={s.billing_mode} onChange={e => setS({ ...s, billing_mode: e.target.value })}>
            <option value="manual">manual</option><option value="per_session">per_session</option><option value="threshold">threshold</option></select>
          <label>{t('threshold')}</label><input type="number" value={s.billing_threshold_fils} onChange={num('billing_threshold_fils')} />
          <button className="btn gold full" onClick={() => post({ action: 'settings', values: s })}>{t('save')}</button>
          {msg && <p className="muted">{msg}</p>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 18 }}><h3>{t('payments')}</h3>
        <table className="tbl"><tbody>{o.payments.map((p: any) => (<tr key={p.id}><td>{new Date(p.created_at).toLocaleString()}</td><td>{p.kind}</td><td>{fmt(p.amount_fils, lang)}</td><td>{p.status}</td></tr>))}</tbody></table></div>
    </main>
  )
}
