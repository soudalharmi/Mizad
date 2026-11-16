'use client'
import { useCallback, useEffect, useState } from 'react'
import { sb } from '@/lib/supabase-browser'
import { useLang } from './Lang'
import PhoneInput from './PhoneInput'
import { fmt } from '@/lib/money'
import AvatarCropper from './AvatarCropper'
import AlertsPanel from './AlertsPanel'
import { DEL, deliverFile, elementToPdf } from '@/lib/sales'
import { useRef } from 'react'

export default function Profile({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang(); const db = sb()
  const [user, setUser] = useState<any>(null), [prof, setProf] = useState<any>(null), [buys, setBuys] = useState<any[]>([]), [mine, setMine] = useState<{ buys: any[]; owned: any[] } | null>(null), [ptab, setPtab] = useState<'buys' | 'owned'>('buys'), [inv, setInv] = useState<any>(null), [busy, setBusy] = useState(false)
  const paper = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(''), [msg, setMsg] = useState(''), [code, setCode] = useState(''), [np, setNp] = useState('')
  const [step, setStep] = useState<'idle' | 'cur' | 'new' | 'newcode'>('idle'), [cropFile, setCropFile] = useState<File | null>(null), [upBusy, setUpBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: { user: u } } = await db.auth.getUser(); setUser(u); if (!u) return
    const { data: p } = await db.from('profiles').select('full_name,avatar_url').eq('id', u.id).maybeSingle(); setProf(p); setName(p?.full_name || '')
    const { data: bs } = await db.from('bidders').select('id').eq('user_id', u.id); const ids = (bs || []).map((b: any) => b.id)
    if (ids.length) {
      const { data } = await db.from('auction_items').select('*,vendors(name,currency)').in('leader_bidder_id', ids).eq('status', 'sold').order('closed_at', { ascending: false })
      setBuys(data || [])
    }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/me/sales').then(r => r.json()).then(j => j.ok && setMine({ buys: j.buys, owned: j.owned })).catch(() => {}) }, [])

  const cur = '+' + (user?.phone || ''), newP = '+' + np.replace(/\D/g, '')
  const upload = async (blob: Blob) => {
    setUpBusy(true); setCropFile(null)
    const path = `${user.id}/${Date.now()}.jpg`
    const { error } = await db.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
    if (error) { setUpBusy(false); return setMsg(error.message) }
    const url = db.storage.from('avatars').getPublicUrl(path).data.publicUrl
    const old = prof?.avatar_url ? decodeURIComponent(String(prof.avatar_url).split('/avatars/')[1]?.split('?')[0] || '') : ''
    const { error: e2 } = await db.from('profiles').update({ avatar_url: url }).eq('id', user.id)
    if (!e2 && old) db.storage.from('avatars').remove([old]) // tidy up the previous photo
    setUpBusy(false); setMsg(e2 ? e2.message : '✓'); load()
  }
  const saveName = async () => { const { error } = await db.from('profiles').update({ full_name: name.trim() }).eq('id', user.id); setMsg(error ? (error.code === '23505' ? t('NAME_TAKEN') : error.message) : '✓'); load() }
  // Phone change: 1) code to the CURRENT number, 2) code to the NEW number.
  const startChange = async () => { setMsg(''); const { error } = await db.auth.signInWithOtp({ phone: cur, options: { shouldCreateUser: false } }); error ? setMsg(error.message) : setStep('cur') }
  const verifyCur = async () => { const { error } = await db.auth.verifyOtp({ phone: cur, token: code, type: 'sms' }); if (error) return setMsg(error.message); setCode(''); setMsg(''); setStep('new') }
  const sendNew = async () => { const { error } = await db.auth.updateUser({ phone: newP }); error ? setMsg(error.message) : (setMsg(''), setStep('newcode')) }
  const verifyNew = async () => {
    const { error } = await db.auth.verifyOtp({ phone: newP, token: code, type: 'phone_change' }); if (error) return setMsg(error.message)
    setCode(''); setNp(''); setStep('idle'); setMsg(t('phone_changed')); load()
  }
  const signOut = async () => { await db.auth.signOut({ scope: 'local' }); onClose(); location.reload() }

  if (!user) return null
  const ok = msg === '✓' || msg === t('phone_changed')
  return (
    <div className="modal" onClick={onClose}><div className="sheet" onClick={e => e.stopPropagation()}>
      <div className="row"><h3 style={{ margin: 0 }}>{t('my_profile')}</h3><button className="btn light" onClick={onClose}>✕</button></div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '16px 0' }}>
        <div style={{ width: 72, height: 72, borderRadius: 99, background: '#eadcc5', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
          {prof?.avatar_url ? <img src={prof.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}</div>
        <label className="btn light" style={{ margin: 0, cursor: 'pointer', opacity: upBusy ? .5 : 1 }}>{t('change_photo')}<input type="file" accept="image/*" hidden disabled={upBusy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCropFile(f) }} /></label>
      </div>
      <label>{t('name')}</label>
      <div className="row"><input value={name} onChange={e => setName(e.target.value)} /><button className="btn" disabled={!name.trim() || name === prof?.full_name} onClick={saveName}>{t('save')}</button></div>
      <label>{t('phone')}</label>
      <div className="kv"><b dir="ltr">{cur}</b>{step === 'idle' && <button className="btn light" onClick={startChange}>{t('change_phone')}</button>}</div>
      {step === 'cur' && <><p className="muted">{t('cur_code_sent')}</p><input dir="ltr" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn full" disabled={!code} onClick={verifyCur}>{t('verify')}</button></>}
      {step === 'new' && <><label>{t('new_phone')}</label><PhoneInput value={np} onChange={setNp} />
        <button className="btn full" disabled={np.replace(/\D/g, '').length < 8} onClick={sendNew}>{t('send_code')}</button></>}
      {step === 'newcode' && <><p className="muted">{t('new_code_sent')}</p><input dir="ltr" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn gold full" disabled={!code} onClick={verifyNew}>{t('verify')}</button></>}
      {msg && <p className="muted" style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>{msg}</p>}
      <AlertsPanel />
      {(() => {
        const L = (a: string, e: string) => (lang === 'ar' ? a : e)
        const M = (f: number, c?: string) => fmt(Number(f || 0), lang, c)
        const fd = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
        const sum = (a: any[]) => (a || []).reduce((n, x) => n + Number(x.amount), 0)
        const Thumb = ({ x }: any) => <div style={{ width: 52, height: 52, borderRadius: 10, background: '#eadcc5', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{x.photo ? <img src={x.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <b dir="ltr" style={{ fontSize: 11 }}>{x.code || '—'}</b>}</div>
        const owned = mine?.owned || [], hasOwned = owned.length > 0, tab = hasOwned ? ptab : 'buys'
        const buyList = mine && mine.buys.length ? mine.buys : null
        const sharePdf = async (name: string) => { if (!paper.current) return; setBusy(true); try { await deliverFile(await elementToPdf(paper.current), name + '.pdf') } catch { setMsg(L('تعذر إنشاء PDF', 'Could not create the PDF')) } setBusy(false) }
        return <>
          <div style={{ display: 'flex', gap: 8, margin: '20px 0 10px' }}>
            <button className={'btn ' + (tab === 'buys' ? 'gold' : 'light')} style={{ flex: 1 }} onClick={() => setPtab('buys')}>{t('purchases')}</button>
            {hasOwned && <button className={'btn ' + (tab === 'owned' ? 'gold' : 'light')} style={{ flex: 1 }} onClick={() => setPtab('owned')}>{L('مبيعاتي', 'My sales')} ({owned.length})</button>}</div>
          {tab === 'buys' && (buyList ? <div className="bidlist">{buyList.map((x: any) => { const paid = sum(x.pays), due = Math.max(0, Number(x.price) - Number(x.support || 0) - paid), d = DEL[x.del_status] || DEL.none
            return <button key={x.id} className="person" style={{ width: '100%', textAlign: 'start', cursor: 'pointer' }} onClick={() => setInv(x)}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}><Thumb x={x} />
                <div style={{ minWidth: 0 }}><b>{x.name}</b><br /><small className="muted">{x.vendor} · {fd(x.sold_on)}</small><br />
                  <span className={'pill ' + (due === 0 ? 'green' : paid > 0 ? 'gold' : 'red')}>{due === 0 ? L('مدفوعة', 'Paid') : paid > 0 ? L('دفع جزئي', 'Partly paid') : L('بانتظار الدفع', 'Awaiting payment')}</span>{' '}
                  {x.del_status !== 'none' && <span className={'pill ' + d[2]}>{L(d[0], d[1])}</span>}</div></div>
              <div style={{ textAlign: 'end' }}><b>{M(x.price, x.currency)}</b><br /><small className="muted">{L('الفاتورة', 'Invoice')} ›</small></div></button> })}</div>
            : buys.length === 0 ? <div className="empty">{t('no_purchases')}</div> : <div className="bidlist">{buys.map(i => (
              <div className="person" key={i.id}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Thumb x={{ photo: i.image_url, code: i.ref_code }} />
                <div><b>{i.name}</b><br /><small className="muted">{i.vendors?.name} · {i.closed_at ? new Date(i.closed_at).toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-GB') : ''}</small></div></div>
                <b>{fmt(i.current_price_fils, lang, i.vendors?.currency)}</b></div>))}</div>)}
          {tab === 'owned' && <div className="bidlist">{owned.map((x: any) => { const sold = x.stage === 'sold', listing = x.listing_when === 'registration' || sold ? Number(x.listing) : 0, deduct = x.listing_upfront ? 0 : listing, paid = sum(x.pays), rem = Math.max(0, Number(x.net || 0) - paid)
            const st = !sold ? ({ listed: L('بانتظار المزاد', 'Waiting for auction'), auction: L('في المزاد الآن', 'In auction now'), unsold: L('لم تُبَع', 'Not sold') } as any)[x.stage] || x.stage : Number(x.buyer_paid) < Number(x.price) ? L('بانتظار دفع المشتري', 'Waiting for the buyer to pay') : rem > 0 ? L('بانتظار تحويل مستحقاتك', 'Your payout is pending') : L('تم تحويل مستحقاتك', 'Paid to you')
            return <div className="card" key={x.id} style={{ boxShadow: 'none', padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Thumb x={x} /><div style={{ minWidth: 0 }}><b>{x.name}</b><br /><small className="muted">{x.vendor} · {x.method === 'order' ? t('type_custom') : t('type_standard')}</small></div></div>
              <div style={{ margin: '8px 0' }}><span className={'pill ' + (sold && rem === 0 ? 'green' : x.stage === 'unsold' ? 'red' : 'gold')}>{st}</span></div>
              {sold ? <>
                <div className="kv"><span>{L('سعر البيع', 'Selling price')}</span><b>{M(x.price, x.currency)}</b></div>
                <div className="kv"><span>{L('العمولة', 'Commission')}</span><b>− {M(x.commission, x.currency)}</b></div>
                {listing > 0 && <div className="kv"><span>{L('رسوم الإدراج', 'Listing fee')} <small className="muted">{x.listing_upfront ? L('(مدفوعة مسبقاً)', '(paid upfront)') : ''}</small></span><b>{x.listing_upfront ? M(listing, x.currency) : '− ' + M(deduct, x.currency)}</b></div>}
                <div className="kv"><span><b>{L('صافي مستحقاتك', 'Your net')}</b></span><b>{M(x.net, x.currency)}</b></div>
                <div className="kv"><span>{L('وصلك', 'Paid to you')}</span><b>{M(paid, x.currency)}</b></div>
                <div className="kv"><span>{L('المتبقي', 'Remaining')}</span><b>{M(rem, x.currency)}</b></div>
                {(x.pays || []).map((y: any) => <div className="kv" key={y.no}><span dir="ltr">{y.no} · {fd(y.paid_on)}{y.rev ? ' · ' + L('عكس', 'reversal') : ''}</span><b>{M(y.amount, x.currency)}</b></div>)}</>
                : <div className="kv"><span>{L('تاريخ الاستلام', 'Date received')}</span><b>{fd(x.received_on)}</b></div>}</div> })}</div>}
          {inv && <div className="sm-modal sm-docmodal" style={{ zIndex: 90 }} onClick={() => setInv(null)}><div className="sm-sheet wide" onClick={e => e.stopPropagation()}>
            {(() => { const paid = sum(inv.pays), due = Math.max(0, Number(inv.price) - Number(inv.support || 0) - paid); return <div className="sm-paper" ref={paper} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              <div className="sm-ptop"><div><div style={{ fontWeight: 700, fontSize: 18 }}>{inv.vendor}</div><div className="pm" dir="ltr">mazadboss.netlify.app/{inv.slug}</div></div>
                <div style={{ textAlign: 'end' }}><div style={{ fontWeight: 700, fontSize: 17 }}>{L('فاتورة', 'Invoice')}</div><div className="pm">{L('رقم', 'No.')} <b dir="ltr">{inv.inv_no}</b><br />{fd(inv.sold_on)}</div></div></div>
              <p style={{ margin: '0 0 10px' }}><span className="pm">{L('المشتري', 'Buyer')}</span><br /><b>{inv.buyer}</b></p>
              <table className="sm-ptable"><thead><tr><th>{L('البيان', 'Item')}</th><th style={{ textAlign: 'end' }}>{L('المبلغ', 'Amount')}</th></tr></thead><tbody>
                <tr><td><b>{inv.name}</b> · <span dir="ltr">{inv.code}</span></td><td style={{ textAlign: 'end' }}><b>{M(inv.price, inv.currency)}</b></td></tr>
                {Number(inv.support) > 0 && <tr><td>{L('مدفوع من الداعمين', 'Covered by supporters')}</td><td style={{ textAlign: 'end' }}>− {M(inv.support, inv.currency)}</td></tr>}
                <tr className="tot"><td>{L('المستحق عليك', 'Your total')}</td><td style={{ textAlign: 'end' }}>{M(Number(inv.price) - Number(inv.support || 0), inv.currency)}</td></tr></tbody></table>
              <div className="pm" style={{ margin: '14px 0 4px' }}>{L('الدفعات', 'Payments')}</div>
              <table className="sm-ptable"><tbody>{(inv.pays || []).length === 0 && <tr><td className="pm">{L('لا توجد دفعات مسجلة بعد', 'No payments recorded yet')}</td></tr>}
                {(inv.pays || []).map((y: any) => <tr key={y.no}><td dir="ltr">{y.no}</td><td>{fd(y.paid_on)}{y.rev ? ' · ' + L('عكس', 'reversal') : ''}</td><td style={{ textAlign: 'end' }}>{M(y.amount, inv.currency)}</td></tr>)}
                <tr className="tot"><td colSpan={2}>{L('المتبقي', 'Balance due')}</td><td style={{ textAlign: 'end' }}>{M(due, inv.currency)}</td></tr></tbody></table>
              {inv.del_status !== 'none' && <p style={{ marginTop: 12 }}><span className="pm">{L('التوصيل', 'Delivery')}:</span> {L((DEL[inv.del_status] || DEL.none)[0], (DEL[inv.del_status] || DEL.none)[1])}{inv.del_company ? ' · ' + inv.del_company : ''}{inv.del_tracking ? <> · <span dir="ltr">{inv.del_tracking}</span></> : null}</p>}
              <div className="pm" style={{ marginTop: 18, borderTop: '1px solid #d9d5cb', paddingTop: 8, textAlign: 'center' }} dir="ltr">Mazad Boss · mazadboss.netlify.app</div></div> })()}
            <div className="sm-docbtns"><button className="btn gold" style={{ flex: 1 }} disabled={busy} onClick={() => sharePdf(inv.inv_no)}>{busy ? '…' : L('مشاركة / حفظ PDF', 'Share / save PDF')}</button></div>
            <button className="btn light full" onClick={() => setInv(null)}>{t('close_btn')}</button></div></div>}
        </>
      })()}
      <button className="btn red full" onClick={signOut}>{t('logout')}</button>
      {cropFile && <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={upload} />}
    </div></div>
  )
}
