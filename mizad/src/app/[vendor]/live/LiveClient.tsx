'use client'
import SocialLinks from '@/components/SocialLinks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { sb } from '@/lib/supabase-browser'
import { useLang } from '@/components/Lang'
import { fmt, aedToFils, setCurrency } from '@/lib/money'
import BidderAuth from '@/components/BidderAuth'
import Profile from '@/components/Profile'
const stripeP = process.env.NEXT_PUBLIC_STRIPE_PK ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PK) : null

function PayForm({ onDone, t }: any) {
  const stripe = useStripe(), els = useElements(); const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const go = async () => {
    if (!stripe || !els) return; setBusy(true)
    const { error } = await stripe.confirmPayment({ elements: els, redirect: 'if_required' })
    setBusy(false); error ? setErr(error.message || '') : onDone()
  }
  return (<><PaymentElement />{err && <p className="muted" style={{ color: 'var(--red)' }}>{err}</p>}
    <button className="btn gold full" disabled={busy} onClick={go}>{t('pay_now')}</button></>)
}

export default function Live({ slug }: { slug: string }) {
  const { t, lang } = useLang(); const db = sb()
  const [vendor, setVendor] = useState<any>(null), [item, setItem] = useState<any>(null), [bids, setBids] = useState<any[]>([])
  const [user, setUser] = useState<any>(null), [me, setMe] = useState<any>(null), [amount, setAmount] = useState(0), [cands, setCands] = useState<any[]>([]), [ben, setBen] = useState<any>(null)
  const [modal, setModal] = useState<'' | 'choose' | 'support' | 'pay'>(''), [secret, setSecret] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const [name, setName] = useState(''), [prof, setProf] = useState<any>(null), [showProfile, setShowProfile] = useState(false), [showHost, setShowHost] = useState(false)
  const [offerAmt, setOfferAmt] = useState(''), [myOffer, setMyOffer] = useState<any>(null)
  const idem = useRef('')

  // Data loading is split so a busy live stays light for the database:
  //  - load(): everything, used on open and after the viewer's own actions
  //  - refreshLive(): only the current product, its last bids and my offer
  //  - live events update the screen directly; a refresh runs at most once per 1.5 s
  const vRef = useRef<any>(null), meRef = useRef<any>(null), itemRef = useRef<any>(null)
  useEffect(() => { itemRef.current = item }, [item])
  useEffect(() => { meRef.current = me }, [me])
  const refreshLive = useCallback(async () => {
    const v = vRef.current; if (!v) return
    const { data: its } = await db.from('auction_items').select('*').eq('vendor_id', v.id).in('status', ['live', 'paused']).order('status').limit(1)
    const it = its?.[0] || null; setItem(it)
    if (it) { const { data: b } = await db.from('bids').select('*').eq('item_id', it.id).order('created_at', { ascending: false }).limit(15); setBids(b || []) } else setBids([])
    const m = meRef.current
    if (it && m) { const { data: o } = await db.from('offers').select('*').eq('item_id', it.id).eq('bidder_id', m.id).order('created_at', { ascending: false }).limit(1); setMyOffer(o?.[0] || null) } else setMyOffer(null)
  }, [])
  const load = useCallback(async () => {
    const { data: v } = await db.from('vendors').select('*').eq('slug', slug).maybeSingle(); vRef.current = v; setVendor(v); if (!v) return
    const { data: { user: u } } = await db.auth.getUser(); setUser(u)
    if (u) {
      const [{ data: m }, { data: p }] = await Promise.all([db.from('bidders').select('*').eq('vendor_id', v.id).eq('user_id', u.id).maybeSingle(), db.from('profiles').select('full_name,avatar_url').eq('id', u.id).maybeSingle()])
      meRef.current = m; setMe(m); setProf(p)
    } else { meRef.current = null; setMe(null); setProf(null) }
    await refreshLive()
  }, [slug, refreshLive])
  useEffect(() => { load() }, [load])
  const refTimer = useRef<any>(null)
  const scheduleRefresh = useCallback((ms = 1500) => { if (refTimer.current) return; refTimer.current = setTimeout(() => { refTimer.current = null; refreshLive() }, ms) }, [refreshLive])
  useEffect(() => () => clearTimeout(refTimer.current), [])
  useEffect(() => {
    if (!vendor) return
    const f = `vendor_id=eq.${vendor.id}`
    let ch = db.channel('live-' + vendor.id + '-' + (me?.id || 'guest'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_items', filter: f }, (p: any) => {
        const row = p.new, cur = itemRef.current
        if (row?.id && cur?.id === row.id && (row.status === 'live' || row.status === 'paused')) setItem((x: any) => ({ ...x, ...row }))  // instant price/leader update
        else scheduleRefresh(300)   // a different product opened or this one closed
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: f }, (p: any) => {
        const row = p.new
        if (row?.item_id && row.item_id === itemRef.current?.id) setBids(list => [row, ...list.filter(x => x.id !== row.id)].slice(0, 15))
      })
    if (me?.id) { // only my own approval status and my own offers matter to me
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: 'bidders', filter: `id=eq.${me.id}` }, (p: any) => { if (p.new?.id) { meRef.current = { ...meRef.current, ...p.new }; setMe((x: any) => ({ ...x, ...p.new })) } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `bidder_id=eq.${me.id}` }, () => scheduleRefresh(300))
    }
    ch.subscribe()
    return () => { db.removeChannel(ch) }
  }, [vendor?.id, me?.id, scheduleRefresh])

  // Safety net only: a light refresh every 20 s while visible, and right away when the viewer comes back to the tab.
  useEffect(() => {
    const i = setInterval(() => { if (document.visibilityState === 'visible') refreshLive() }, 20000)
    const onVis = () => { if (document.visibilityState === 'visible') refreshLive() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', onVis) }
  }, [refreshLive])

  const hasLeader = !!item?.leader_bidder_id
  const next = item ? (hasLeader ? item.current_price_fils + item.increment_fils : item.start_price_fils) : 0
  useEffect(() => { setAmount(a => Math.max(a, next)) }, [next])
  const isLeader = me && item?.leader_bidder_id === me.id
  const isCustomHidden = item?.auction_type === 'custom' && !item?.revealed
  const canBid = me?.status === 'approved' && item?.status === 'live' && !isLeader && !isCustomHidden
  const canSupport = canBid && hasLeader
  const err = (c: string) => t(c) === c ? t('GENERIC') : t(c)
  const post = async (url: string, body: any) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.json() }
  const key = () => (idem.current ||= crypto.randomUUID())

  const bid = async () => {
    setBusy(true); const j = await post('/api/bid', { itemId: item.id, amountFils: amount, idem: key() }); setBusy(false); idem.current = ''
    setModal(''); setMsg(j.error ? err(j.error) : t('bid_ok')); load()
  }
  const support = async () => {
    setBusy(true); const j = await post('/api/support', { itemId: item.id, beneficiaryId: ben?.id, newPriceFils: amount, idem: key() }); setBusy(false)
    idem.current = ''; setModal('')
    if (j.error) return setMsg(err(j.error))
    setMsg(t('support_ok')); load()
  }
  // bidders on this product that can be supported: not the current leader and not me
  const openSupport = async () => {
    setBen(null); setModal('support')
    const { data } = await db.from('bids').select('bidder_id,bidder_name').eq('item_id', item.id).limit(2000)
    const seen: Record<string, any> = {}
    for (const b of data || []) if (b.bidder_id !== item.leader_bidder_id && b.bidder_id !== me?.id && !seen[b.bidder_id]) seen[b.bidder_id] = { id: b.bidder_id, name: b.bidder_name }
    setCands(Object.values(seen))
  }
  const sendOffer = async () => {
    setBusy(true); const j = await post('/api/offer', { itemId: item.id, amountFils: aedToFils(offerAmt), idem: crypto.randomUUID() }); setBusy(false)
    if (j.error) return setMsg(err(j.error)); setOfferAmt(''); setMsg(t('offer_sent')); load()
  }
  const join = async () => { const nm = (prof?.full_name || name).trim(); const { error } = await db.from('bidders').insert({ vendor_id: vendor.id, user_id: user.id, name: nm }); error ? setMsg(error.message) : load() }
  useEffect(() => { if (msg) { const x = setTimeout(() => setMsg(''), 4000); return () => clearTimeout(x) } }, [msg])
  // While waiting for host approval, check every 4s so the page unlocks without a refresh.
  useEffect(() => { // waiting for approval: check only my own row (the live event usually arrives first)
    if (me?.status !== 'pending' || !me?.id) return
    const i = setInterval(async () => { const { data } = await db.from('bidders').select('*').eq('id', me.id).maybeSingle(); if (data) { meRef.current = data; setMe(data) } }, 6000)
    return () => clearInterval(i)
  }, [me?.status, me?.id])

  if (!vendor) return <main className="wrap"><div className="empty">…</div></main>
  setCurrency(vendor.currency)
  const contrib = amount - (item?.current_price_fils || 0)
  return (
    <main className="wrap" style={{ maxWidth: 560 }}>
      <div className="row section"><button onClick={() => setShowHost(true)} aria-label={vendor.name} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, background: 'none', padding: 0, textAlign: 'start' }}><span style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', background: '#eadcc5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{vendor.logo_url ? <img src={vendor.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (vendor.name || '?').charAt(0)}</span><h2 style={{ margin: 0 }}>{vendor.name}</h2></button><div className="row" style={{ gap: 8 }}><a href="/explore" className="pill" style={{ textDecoration: 'none' }}>{t('explore')}</a>
        {user && <button onClick={() => setShowProfile(true)} style={{ width: 40, height: 40, borderRadius: 99, background: '#eadcc5', overflow: 'hidden', padding: 0, fontSize: 18 }} aria-label={t('my_profile')}>{prof?.avatar_url ? <img src={prof.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}</button>}</div></div>
      <div className="card section">
        {!item ? <div className="empty">{t('no_item')}</div> : (<>
          <div className="product">
            <div className="product-img">{item.image_url ? <img src={item.image_url} alt={item.name} /> : item.ref_code
              ? <div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: '#55574f' }}>{t('ref_code')}</div><b dir="ltr" style={{ fontSize: 20, letterSpacing: 2 }}>{item.ref_code}</b></div> : '—'}</div>
            <div><h3>{item.name}</h3><div className="muted">{item.description}</div>
              {isCustomHidden ? <span className="pill gold" style={{ marginTop: 8, display: 'inline-block' }}>{t('custom_badge')}</span> : <div className="muted" style={{ marginTop: 8 }}>{t('start_price')}: {fmt(item.start_price_fils, lang)}</div>}</div>
          </div>
          <div className="row" style={{ marginTop: 14 }}><span className="muted">{t('current_bid')}</span>{item.status === 'paused' && <span className="pill gold">{t('paused')}</span>}</div>
          {isCustomHidden ? <div className="muted" style={{ margin: '10px 0' }}>{t('custom_wait')}</div> : <div className="price">{fmt(item.current_price_fils, lang)}</div>}
          {hasLeader && <div className="muted">{t('leader')}: <b>{item.leader_name}</b></div>}
          {isLeader && <div className="pill green" style={{ display: 'inline-block', marginTop: 8 }}>{t('you_lead')}</div>}
          {isCustomHidden && me?.status === 'approved' && item.status === 'live' && (<>
            {item.offer_floor_fils > 0 && <div className="notice">{t('offer_floor')}: <b>{fmt(item.offer_floor_fils, lang)}</b></div>}
            {myOffer?.status === 'pending' && <div className="notice">{t('offer_pending')}: <b>{fmt(myOffer.amount_fils, lang)}</b></div>}
            {myOffer?.status === 'rejected' && <div className="notice" style={{ color: 'var(--red)' }}>{t('offer_rejected')}</div>}
            <label>{t('your_price')}</label><input dir="ltr" inputMode="numeric" value={offerAmt} onChange={e => setOfferAmt(e.target.value.replace(/[^0-9]/g, ''))} />
            <button className="btn gold full" disabled={busy || !offerAmt || aedToFils(offerAmt) <= item.offer_floor_fils} onClick={sendOffer}>{t('send_offer')}</button></>)}
          {canBid && (<>
            <div className="muted" style={{ marginTop: 12 }}>{t('next_bid')}: {fmt(next, lang)}</div>
            <div className="stepper">
              <button className="btn light" onClick={() => setAmount(a => Math.max(next, a - item.increment_fils))}>−</button>
              <input readOnly value={fmt(amount, lang)} />
              <button className="btn light" onClick={() => setAmount(a => a + item.increment_fils)}>+</button>
            </div>
            <button className="btn gold full" onClick={() => setModal('choose')} style={{ display: canSupport ? 'block' : 'none' }}>{t('bid_now')}</button>
            {!canSupport && <button className="btn gold full" disabled={busy} onClick={bid}>{t('bid_now')}</button>}
          </>)}
        </>)}
      </div>

      {!user && <div className="card section"><BidderAuth onDone={load} allowSignup={false} next={`/${slug}/live`} /></div>}
      {user && !me && <div className="card section">
        {!prof?.full_name && <><label>{t('name')}</label><input value={name} onChange={e => setName(e.target.value)} /></>}
        <button className="btn gold full" disabled={!(prof?.full_name || name).trim()} onClick={join}>{t('request_join_one')}</button></div>}
      {me?.status === 'pending' && <div className="notice">{t('pending_msg')}</div>}
      {(me?.status === 'rejected' || me?.status === 'suspended') && <div className="notice">{t('rejected_msg')}</div>}

      <div className="card section"><h3>{t('bids')}</h3>
        {bids.length === 0 ? <div className="empty">{t('no_bids')}</div> : <div className="bidlist">{bids.map(b => (
          <div className="bidrow" key={b.id}><strong>{b.bidder_name}</strong><span>{fmt(b.amount_fils, lang)}</span></div>))}</div>}
      </div>
      <div className="card"><h3>{t('rules_title')}</h3><p className="muted">{t('rules_text')}</p></div>

      {modal && item && (
        <div className="modal" onClick={() => !busy && modal !== 'pay' && setModal('')}><div className="sheet" onClick={e => e.stopPropagation()}>
          {modal === 'choose' && (<>
            <h3>{fmt(amount, lang)}</h3>
            <button className="btn gold full" disabled={busy} onClick={bid}>{t('bid_self')}</button>
            <button className="btn full" onClick={openSupport}>{t('bid_support')}</button>
            <button className="btn light full" onClick={() => setModal('')}>{t('cancel')}</button></>)}
          {modal === 'support' && (<>
            <h3>{t('bid_support')}</h3>
            <p style={{ margin: '4px 0 8px', fontWeight: 600 }}>{t('who_support')}</p>
            {cands.length === 0 ? <p className="muted">{t('no_support_cands')}</p> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>{cands.map(c => (
              <button key={c.id} className={'btn ' + (ben?.id === c.id ? 'gold' : 'light')} onClick={() => setBen(c)}>{ben?.id === c.id ? '✓ ' : ''}{c.name}</button>))}</div>}
            <div className="kv"><span>{t('current_price')}</span><b>{fmt(item.current_price_fils, lang)}</b></div>
            <div className="kv"><span>{t('proposed_price')}</span><b>{fmt(amount, lang)}</b></div>
            <div className="kv"><span>{t('your_contrib')}</span><b>{fmt(contrib, lang)}</b></div>
            <p className="muted">{t('support_note')}</p>
            <button className="btn gold full" disabled={busy || contrib <= 0 || !ben} onClick={support}>{t('confirm_support')}</button>
            <button className="btn light full" onClick={() => setModal('')}>{t('cancel')}</button></>)}
          {modal === 'pay' && stripeP && (<Elements stripe={stripeP} options={{ clientSecret: secret }}>
            <h3>{fmt(contrib, lang)}</h3>
            <PayForm t={t} onDone={() => { setModal(''); setMsg(t('support_wait')); idem.current = '' }} /></Elements>)}
        </div></div>)}
      {showHost && <div onClick={() => setShowHost(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', background: '#eadcc5', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, boxShadow: '0 0 0 3px #a77b3c55' }}>
            {vendor.logo_url ? <img src={vendor.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (vendor.name || '?').charAt(0)}</div>
          <h3 style={{ margin: '0 0 6px' }}>{vendor.name}</h3>
          {vendor.bio ? <p style={{ whiteSpace: 'pre-wrap' }}>{vendor.bio}</p> : <p className="muted">{t('no_bio')}</p>}
          <div style={{ display: 'flex', justifyContent: 'center' }}><SocialLinks socials={vendor.socials} /></div>
          <button className="btn light full" style={{ marginTop: 16 }} onClick={() => setShowHost(false)}>{t('close_btn')}</button>
        </div></div>}
      {showProfile && <Profile onClose={() => { setShowProfile(false); load() }} />}
      {msg && <div className="toast">{msg}</div>}
    </main>
  )
}
