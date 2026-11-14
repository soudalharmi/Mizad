'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase-browser'
import { useLang } from '@/components/Lang'
import { aedToFils, fmt } from '@/lib/money'
import StreamMode from '@/components/StreamMode'

const genCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(5)); return 'MZ-' + Array.from(r, x => A[x % A.length]).join('') }

export default function Dash() {
  const { t, lang } = useLang(); const db = sb(); const router = useRouter()
  const [v, setV] = useState<any>(null), [ready, setReady] = useState(false), [tab, setTab] = useState('auction'), [toast, setToast] = useState('')
  const [items, setItems] = useState<any[]>([]), [bidders, setBidders] = useState<any[]>([]), [bids, setBids] = useState<any[]>([])
  const [sup, setSup] = useState<any[]>([]), [fees, setFees] = useState<any[]>([]), [inv, setInv] = useState<any[]>([])
  const [form, setForm] = useState<any>({ name: '', description: '', start: '', inc: '' }), [file, setFile] = useState<File | null>(null), [mode, setMode] = useState<'photo' | 'code'>('photo'), [code, setCode] = useState(() => genCode())
  const [slug, setSlug] = useState(''), [vname, setVname] = useState('')
  const [secrets, setSecrets] = useState<Record<string, any>>({}), [offers, setOffers] = useState<any[]>([]), [atype, setAtype] = useState<'standard' | 'custom'>('standard')
  const [sessions, setSessions] = useState<any[]>([]), [parts, setParts] = useState<Record<string, number>>({}), [streaming, setStreaming] = useState(false), [sTitle, setSTitle] = useState('')
  const itemsRef = useRef<any[]>([])
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    const { data: { user } } = await db.auth.getUser(); if (!user) return router.push('/login')
    const { data: vv } = await db.from('vendors').select('*').eq('owner_id', user.id).maybeSingle(); setV(vv); setReady(true); if (!vv) return
    const q = (tb: string) => db.from(tb).select('*').eq('vendor_id', vv.id)
    const [a, b, c, d, e, f, g, h, k] = await Promise.all([
      q('auction_items').order('position'), q('bidders').order('created_at', { ascending: false }),
      q('bids').order('created_at', { ascending: false }).limit(30), q('support_contributions').order('created_at', { ascending: false }).limit(30),
      db.from('item_service_fees').select('*,auction_items(name)').eq('vendor_id', vv.id), q('invoices').order('created_at', { ascending: false }),
      q('item_secrets'), q('offers').order('created_at', { ascending: false }).limit(80), q('auctions').order('created_at', { ascending: false })])
    setItems(a.data || []); setBidders(b.data || []); setBids(c.data || []); setSup(d.data || []); setFees(e.data || []); setInv(f.data || [])
    setSecrets(Object.fromEntries((g.data || []).map((x: any) => [x.item_id, x]))); setOffers(h.data || []); setSessions(k.data || []); itemsRef.current = a.data || []
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!v) return; const f = `vendor_id=eq.${v.id}`
    const ch = db.channel('dash-' + v.id)
    for (const table of ['auction_items', 'bids', 'support_contributions', 'bidders', 'offers', 'auctions']) ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: f }, load)
    ch.subscribe(); return () => { db.removeChannel(ch) }
  }, [v?.id, load])
  // Safety net: refresh every 4s while the dashboard is open, so new requests always appear without a manual refresh.
  useEffect(() => {
    if (!v) return
    const i = setInterval(() => { if (document.visibilityState === 'visible') load() }, 4000)
    return () => clearInterval(i)
  }, [v?.id, load])
  useEffect(() => {
    if (tab !== 'sessions' || !v) return
    let off = false
    const run = async () => {
      const [b, o] = await Promise.all([db.from('bids').select('item_id,bidder_id').eq('vendor_id', v.id).limit(10000), db.from('offers').select('item_id,bidder_id').eq('vendor_id', v.id).limit(10000)])
      const sess: Record<string, string> = Object.fromEntries(itemsRef.current.map((i: any) => [i.id, i.auction_id])); const m: Record<string, Set<string>> = {}
      for (const r of [...(b.data || []), ...(o.data || [])]) { const sid = sess[r.item_id]; if (!sid) continue; (m[sid] ||= new Set()).add(r.bidder_id) }
      if (!off) setParts(Object.fromEntries(Object.entries(m).map(([key, x]) => [key, x.size])))
    }
    run(); const i = setInterval(run, 8000); return () => { off = true; clearInterval(i) }
  }, [tab, v?.id])
  const pendingCount = bidders.filter(b => b.status === 'pending').length
  const offerCount = offers.filter(o => o.status === 'pending' && items.some(i => i.id === o.item_id && !i.revealed && (i.status === 'live' || i.status === 'paused'))).length
  useEffect(() => { const n = pendingCount + offerCount; document.title = n ? `(${n}) MIZAD` : 'Mizad | مِزاد' }, [pendingCount, offerCount])

  const post = async (url: string, body: any = {}) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
  const act = async (action: string, itemId: string) => { const j = await post('/api/vendor/item', { itemId, action }); j.error ? say(t(j.error) === j.error ? t('GENERIC') : t(j.error)) : load() }
  const sessionAct = async (action: 'start' | 'end') => { const j = await post('/api/vendor/session', { action, title: sTitle }); if (j.error) return say(t(j.error) === j.error ? t('GENERIC') : t(j.error)); setSTitle(''); load() }
  const logout = async () => { await db.auth.signOut({ scope: 'local' }); router.push('/login') }
  const decide = async (offerId: string, accept: boolean) => { const j = await post('/api/vendor/offer', { offerId, accept }); j.error ? say(t(j.error) === j.error ? t('GENERIC') : t(j.error)) : load() }
  const setStatus = async (id: string, status: string) => { await db.from('bidders').update({ status }).eq('id', id); load() }
  const toggleAuto = async () => { const nv = !v.auto_approve; const { error } = await db.from('vendors').update({ auto_approve: nv }).eq('id', v.id); error ? say(error.message) : setV({ ...v, auto_approve: nv }) }
  const approveAll = async () => { await db.from('bidders').update({ status: 'approved' }).eq('vendor_id', v.id).eq('status', 'pending'); load() }
  const pay = async (kind: string, invoiceId?: string) => { const j = await post('/api/vendor/pay', { kind, invoiceId }); if (j.url) location.href = j.url; else say(t('GENERIC')) }
  const createVendor = async () => { const { error } = await db.from('vendors').insert({ slug: slug.toLowerCase(), name: vname }); error ? say(error.message) : load() }
  const addItem = async () => {
    let image_url = null, ref_code: string | null = null
    if (mode === 'code') ref_code = code
    else if (file) { const p = `${v.id}/${crypto.randomUUID()}`; const { error } = await db.storage.from('products').upload(p, file); if (!error) image_url = db.storage.from('products').getPublicUrl(p).data.publicUrl }
    const { data: ins, error } = await db.from('auction_items').insert({ vendor_id: v.id, name: form.name, description: form.description, image_url, ref_code,
      position: items.length, start_price_fils: atype === 'custom' ? 100 : aedToFils(form.start), increment_fils: atype === 'custom' ? 200 : aedToFils(form.inc), auction_type: atype }).select('id').single()
    if (error) { if (error.code === '23505' && mode === 'code') { setCode(genCode()); return say('Code was taken, a new one was generated. Tap save again.') } return say(error.message) }
    if (atype === 'custom') {
      const { error: e2 } = await db.from('item_secrets').insert({ item_id: ins!.id, vendor_id: v.id, start_price_fils: aedToFils(form.start), increment_fils: aedToFils(form.inc) })
      if (e2) return say(e2.message)
    }
    setForm({ name: '', description: '', start: '', inc: '' }); setFile(null); setCode(genCode()); load()
  }
  const statement = (i: any) => {
    const rows = fees.filter(f => f.invoice_id === i.id).map(f => `${(f.auction_items?.name || '').replace(/,/g, ' ')},${(f.amount_fils / 100).toFixed(2)}`)
    const blob = new Blob([`item,fee_AED\n${rows.join('\n')}\ntotal,${(i.total_fils / 100).toFixed(2)}`], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mizad-statement-${i.id.slice(0, 8)}.csv`; a.click()
  }

  if (!ready) return <main className="wrap"><div className="empty">…</div></main>
  if (!v) return (<main className="wrap" style={{ maxWidth: 460 }}><div className="card"><h2>{t('create_page')}</h2>
    <label>{t('store_name')}</label><input value={vname} onChange={e => setVname(e.target.value)} />
    <label>{t('slug')}</label><input dir="ltr" value={slug} onChange={e => setSlug(e.target.value)} placeholder="my-auction" />
    <button className="btn gold full" onClick={createVendor}>{t('create_page')}</button></div>{toast && <div className="toast">{toast}</div>}</main>)
  if (v.status === 'pending_activation') return (<main className="wrap" style={{ maxWidth: 460 }}><div className="card"><h2>{t('activate_title')}</h2>
    <p className="muted">{t('activate_text')}</p><button className="btn gold full" onClick={() => pay('activation')}>{t('activate_btn')}</button></div></main>)
  if (v.status === 'suspended') return <main className="wrap"><div className="notice">{t('suspended')}</div></main>

  const liveSession = sessions.find(x => x.status === 'live')
  const cur = items.find(i => i.status === 'live') || items.find(i => i.status === 'paused') || items.find(i => i.status === 'queued')
  const supTotal = cur ? cur.current_price_fils - cur.base_bid_fils : 0
  const unbilled = fees.filter(f => !f.invoice_id).reduce((s, f) => s + f.amount_fils, 0)
  const openInv = inv.filter(i => i.status === 'open').reduce((s, i) => s + i.total_fils, 0)
  const link = typeof location !== 'undefined' ? `${location.origin}/${v.slug}/live` : ''
  const pending = bidders.filter(b => b.status === 'pending'), approved = bidders.filter(b => b.status === 'approved')
  const stPill = (s: string) => s === 'live' ? 'green' : s === 'paused' ? 'gold' : ''

  return (
    <main className="wrap">
      <div className="row section" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn gold" onClick={() => setStreaming(true)}>🎥 {t('stream_mode')}</button><button className="btn light" onClick={logout}>{t('logout')}</button></div>
      <div className="tabs">{['auction', 'sessions', 'bidders', 'products', 'history', 'billing'].map(k => <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{t('tab_' + k)}{(() => { const n = k === 'bidders' ? pendingCount : k === 'auction' ? offerCount : 0; return n > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', marginInlineStart: 8, borderRadius: 99, background: '#d93025', color: '#fff', fontSize: 12, fontWeight: 700 }}>{n}</span> })()}</button>)}</div>
      <div className="notice">{t('share_link')}: <b dir="ltr">{link}</b></div>

      {tab === 'auction' && <><div className="card section">
        {liveSession ? <div className="row"><div><span className="pill green">● {t('live_now')}</span> <b>{liveSession.title}</b><div className="muted">{t('session_since')} {new Date(liveSession.started_at || liveSession.created_at).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-GB')}</div></div>
          <button className="btn red" onClick={() => { if (confirm(t('end_session') + '?')) sessionAct('end') }}>{t('end_session')}</button></div>
          : <><p className="muted" style={{ marginTop: 0 }}>{t('session_none')}</p><input placeholder={t('session_title_ph')} value={sTitle} onChange={e => setSTitle(e.target.value)} />
            <button className="btn gold full" onClick={() => sessionAct('start')}>{t('start_session')}</button></>}
      </div><div className="grid">
        <div>
          <div className="card section">
            {!cur ? <div className="empty">{t('no_item')}</div> : (<>
              <div className="row"><h2 style={{ margin: 0 }}>{cur.name}{cur.ref_code && <span className="pill gold" dir="ltr" style={{ marginInlineStart: 8 }}>{cur.ref_code}</span>}</h2><span className={'pill ' + stPill(cur.status)}>{cur.status}</span></div>
              <div className="stats" style={{ marginTop: 16 }}>
                <div className="stat"><span className="muted">{t('current_bid')}</span><b>{cur.auction_type === 'custom' && !cur.revealed ? '—' : fmt(cur.current_price_fils, lang)}</b></div>
                <div className="stat"><span className="muted">{t('winner')}</span><b style={{ fontSize: 16 }}>{cur.leader_name || '—'}</b></div>
                <div className="stat"><span className="muted">{t('bids_count')}</span><b>{cur.bid_count}</b></div>
              </div>
              <div className="kv"><span>{t('base_bid')}</span><b>{fmt(cur.base_bid_fils, lang)}</b></div>
              <div className="kv"><span>{t('support_total')}</span><b>{fmt(cur.auction_type === 'custom' && !cur.revealed ? 0 : supTotal, lang)}</b></div>
              {cur.auction_type === 'custom' && secrets[cur.id] && <><div className="kv"><span>{t('host_start')} <small className="muted">({t('host_only')})</small></span><b>{fmt(secrets[cur.id].start_price_fils, lang)}</b></div>
                <div className="kv"><span>{t('host_inc')} <small className="muted">({t('host_only')})</small></span><b>{fmt(secrets[cur.id].increment_fils, lang)}</b></div></>}
              <div className="bid-action">
                <button className="btn green" disabled={!liveSession || cur.status === 'live' || cur.status === 'sold'} onClick={() => act('open', cur.id)}>{t('open')}</button>
                <button className="btn light" disabled={cur.status !== 'live'} onClick={() => act('pause', cur.id)}>{t('pause')}</button>
                <button className="btn red" disabled={cur.status === 'queued'} onClick={() => act('close', cur.id)}>{t('close')}</button>
                <button className="btn" disabled={!liveSession} onClick={() => act('next', cur.id)}>{t('next')}</button>
              </div></>)}
          </div>
          {cur && cur.auction_type === 'custom' && !cur.revealed && <div className="card section"><div className="row"><h3>{t('offers')}</h3><span className="pill gold">{t('type_custom')}</span></div>
            {cur.offer_floor_fils > 0 && <div className="notice">{t('offer_floor')}: <b>{fmt(cur.offer_floor_fils, lang)}</b></div>}
            {offers.filter(o => o.item_id === cur.id && o.status === 'pending').length === 0 ? <div className="empty">{t('no_offers')}</div> : <div className="bidlist">{offers.filter(o => o.item_id === cur.id && o.status === 'pending').map(o => (
              <div className="person" key={o.id}><div><b>{o.bidder_name}</b><br /><small className="muted">{new Date(o.created_at).toLocaleTimeString()}</small></div>
                <div className="person-actions"><b style={{ alignSelf: 'center' }}>{fmt(o.amount_fils, lang)}</b><button className="btn green" onClick={() => decide(o.id, true)}>{t('accept')}</button><button className="btn red" onClick={() => decide(o.id, false)}>{t('reject')}</button></div></div>))}</div>}
          </div>}
          <div className="card"><h3>{t('bids')}</h3>
            {bids.length === 0 ? <div className="empty">{t('no_bids')}</div> : <div className="bidlist">{bids.map(b => (
              <div className="bidrow" key={b.id}><div><strong>{b.bidder_name}</strong><br /><small>{new Date(b.created_at).toLocaleTimeString()}</small></div><span>{fmt(b.amount_fils, lang)}</span></div>))}</div>}
          </div>
        </div>
        <div className="card"><h3>{t('ledger')}</h3>
          {sup.length === 0 ? <div className="empty">—</div> : <div className="bidlist">{sup.map(s => (
            <div className="bidrow" key={s.id}><div><strong>{s.supporter_name} → {s.beneficiary_name}</strong><br /><small>{fmt(s.price_before_fils, lang)} → {fmt(s.price_after_fils, lang)}</small></div>
              <div style={{ textAlign: 'end' }}><b>{fmt(s.amount_fils, lang)}</b><br /><span className={'pill ' + (s.status === 'authorized' || s.status === 'captured' ? 'green' : s.status === 'pending_payment' ? 'gold' : 'red')}>{s.status}</span></div></div>))}</div>}
        </div>
      </div></>}

      {tab === 'bidders' && <><div className="card section"><div className="row"><div><b>{t('auto_approve')}</b><div className="muted">{t('auto_approve_hint')}</div></div><button className={'btn ' + (v.auto_approve ? 'green' : 'light')} onClick={toggleAuto}>{v.auto_approve ? t('on') : t('off')}</button></div></div><div className="grid">
        <div className="card"><div className="row"><h3>{t('pending')} ({pending.length})</h3>{pending.length > 0 && <button className="btn green" onClick={approveAll}>{t('approve_all')}</button>}</div><div className="bidlist">{pending.map(b => (
          <div className="person" key={b.id}><div><b>{b.name}</b><br /><small className="muted" dir="ltr">{b.phone}</small></div>
            <div className="person-actions"><button className="btn green" onClick={() => setStatus(b.id, 'approved')}>{t('approve')}</button><button className="btn red" onClick={() => setStatus(b.id, 'rejected')}>{t('reject')}</button></div></div>))}</div></div>
        <div className="card"><h3>{t('approved')} ({approved.length})</h3><div className="bidlist">{approved.map(b => (
          <div className="person" key={b.id}><b>{b.name}</b><button className="btn red" onClick={() => setStatus(b.id, 'suspended')}>{t('suspend')}</button></div>))}</div></div>
      </div></>}

      {tab === 'products' && <div className="grid">
        <div className="card"><h3>{t('add_item')}</h3>
          <div className="row" style={{ gap: 8 }}><button className={'btn ' + (atype === 'standard' ? '' : 'light')} style={{ flex: 1 }} onClick={() => setAtype('standard')}>{t('type_standard')}</button><button className={'btn ' + (atype === 'custom' ? '' : 'light')} style={{ flex: 1 }} onClick={() => setAtype('custom')}>{t('type_custom')}</button></div>
          {atype === 'custom' && <div className="notice" style={{ marginTop: 10 }}>{t('custom_hint')}</div>}
          <label>{t('name')}</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <label>{t('desc')}</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <label>{t('start_price')} (AED)</label><input inputMode="decimal" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
          <label>{t('increment')} (AED, ≥ 2)</label><input inputMode="decimal" value={form.inc} onChange={e => setForm({ ...form, inc: e.target.value })} />
          <label>{t('image')}</label>
          <div className="row" style={{ gap: 8 }}><button className={'btn ' + (mode === 'photo' ? '' : 'light')} style={{ flex: 1 }} onClick={() => setMode('photo')}>{t('photo_mode')}</button><button className={'btn ' + (mode === 'code' ? '' : 'light')} style={{ flex: 1 }} onClick={() => setMode('code')}>{t('code_mode')}</button></div>
          {mode === 'photo' ? <input type="file" accept="image/*" style={{ marginTop: 10 }} onChange={e => setFile(e.target.files?.[0] || null)} />
            : <div className="notice" style={{ marginTop: 10 }}><div className="row"><b dir="ltr" style={{ fontSize: 22, letterSpacing: 2 }}>{code}</b><button className="btn light" onClick={() => setCode(genCode())}>{t('regenerate')}</button></div><div className="muted" style={{ marginTop: 6 }}>{t('code_hint')}</div></div>}
          <button className="btn gold full" disabled={!form.name || !form.start || !form.inc} onClick={addItem}>{t('save')}</button></div>
        <div className="card"><div className="bidlist">{items.map(i => (
          <div className="person" key={i.id}><div><b>{i.name}</b> {i.ref_code && <span className="pill gold" dir="ltr">{i.ref_code}</span>} {i.auction_type === 'custom' && <span className="pill">{t('custom_badge')}</span>}<br /><small className="muted">{fmt(secrets[i.id]?.start_price_fils ?? i.start_price_fils, lang)} · +{fmt(secrets[i.id]?.increment_fils ?? i.increment_fils, lang)}</small></div>
            <div className="person-actions"><span className={'pill ' + stPill(i.status)}>{i.status}</span>
              {(i.status === 'queued' || i.status === 'paused') && <button className="btn green" disabled={!liveSession} onClick={() => act('open', i.id)}>{t('open')}</button>}</div></div>))}</div></div>
      </div>}

      {tab === 'sessions' && <div className="card"><h3>{t('sessions_title')}</h3>
        {sessions.filter(x => x.status === 'live' || items.some(i => i.auction_id === x.id)).length === 0 ? <div className="empty">{t('no_sessions')}</div> : <div className="bidlist">
          {sessions.filter(x => x.status === 'live' || items.some(i => i.auction_id === x.id)).map(x => {
            const its = items.filter(i => i.auction_id === x.id), soldI = its.filter(i => i.status === 'sold'), ret = its.filter(i => i.status === 'unsold')
            const total = soldI.reduce((sum, i) => sum + i.current_price_fils, 0)
            return (<div className="card" key={x.id} style={{ boxShadow: 'none', background: '#faf9f6' }}>
              <div className="row"><div><b>{x.title}</b><div className="muted">{new Date(x.started_at || x.created_at).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-GB')}</div></div>
                <span className={'pill ' + (x.status === 'live' ? 'green' : '')}>{x.status === 'live' ? t('live_now') : t('ended')}</span></div>
              <div className="stats" style={{ marginTop: 12, marginBottom: 0, gridTemplateColumns: 'repeat(2,1fr)' }}>
                <div className="stat"><span className="muted">{t('participants')}</span><b>{parts[x.id] || 0}</b></div>
                <div className="stat"><span className="muted">{t('total_sales')}</span><b>{fmt(total, lang)}</b></div>
                <div className="stat"><span className="muted">{t('products_sold')}</span><b>{soldI.length}</b></div>
                <div className="stat"><span className="muted">{t('returned')}</span><b>{ret.length}</b></div></div></div>)
          })}</div>}</div>}

      {tab === 'history' && <div className="card"><h3>{t('sold_items')}</h3>
        {items.filter(i => i.status === 'sold' || i.status === 'unsold').length === 0 ? <div className="empty">{t('no_history')}</div> : <div className="bidlist">
          {items.filter(i => i.status === 'sold' || i.status === 'unsold').sort((a, b) => +new Date(b.closed_at || 0) - +new Date(a.closed_at || 0)).map(i => {
            const w = bidders.find(b => b.id === i.leader_bidder_id)
            return (<div className="person" key={i.id}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: 10, background: '#eadcc5', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {i.image_url ? <img src={i.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <b dir="ltr" style={{ fontSize: 12 }}>{i.ref_code || '📿'}</b>}</div>
                <div><b>{i.name}</b> {i.ref_code && i.image_url && <span className="pill gold" dir="ltr">{i.ref_code}</span>}<br />
                  {i.status === 'sold' ? <><span>{t('winner')}: <b>{i.leader_name}</b></span><br /><small className="muted" dir="ltr">{w?.phone ? (String(w.phone).startsWith('+') ? w.phone : '+' + w.phone) : ''}</small></> : <span className="pill red">{t('unsold')}</span>}<br />
                  <small className="muted">{t('date')}: {i.closed_at ? new Date(i.closed_at).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-GB') : ''}</small></div></div>
              {i.status === 'sold' && <b>{fmt(i.current_price_fils, lang)}</b>}</div>)
          })}</div>}</div>}

      {tab === 'billing' && <div className="grid">
        <div className="card"><div className="stats">
          <div className="stat"><span className="muted">{t('outstanding')}</span><b>{fmt(unbilled + openInv, lang)}</b></div>
          <div className="stat"><span className="muted">{t('chargeable')}</span><b>{fees.length}</b></div>
          <div className="stat"><span className="muted">{t('fee_item')}</span><b>{fmt(fees[0]?.amount_fils ?? 250, lang)}</b></div></div>
          <button className="btn full" disabled={!unbilled} onClick={async () => { await post('/api/vendor/invoice'); load() }}>{t('gen_invoice')}</button></div>
        <div className="card"><h3>{t('invoices')}</h3><div className="bidlist">{inv.map(i => (
          <div className="person" key={i.id}><div><b>{fmt(i.total_fils, lang)}</b><br /><small className="muted">{new Date(i.created_at).toLocaleDateString()}</small></div>
            <div className="person-actions"><span className={'pill ' + (i.status === 'paid' ? 'green' : 'gold')}>{i.status === 'paid' ? t('paid') : t('open_s')}</span>
              <button className="btn light" onClick={() => statement(i)}>{t('download')}</button>
              {i.status === 'open' && <button className="btn gold" onClick={() => pay('invoice', i.id)}>{t('pay')}</button>}</div></div>))}</div></div>
      </div>}
      {streaming && <StreamMode items={items} bidders={bidders} vendorName={v.name} lang={lang} t={t} onApprove={(id: string) => setStatus(id, 'approved')} onReject={(id: string) => setStatus(id, 'rejected')} onExit={() => setStreaming(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}
