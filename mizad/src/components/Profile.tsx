'use client'
import { useCallback, useEffect, useState } from 'react'
import { sb } from '@/lib/supabase-browser'
import { useLang } from './Lang'
import { fmt } from '@/lib/money'
import AvatarCropper from './AvatarCropper'

export default function Profile({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang(); const db = sb()
  const [user, setUser] = useState<any>(null), [prof, setProf] = useState<any>(null), [buys, setBuys] = useState<any[]>([])
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

  const cur = '+' + (user?.phone || ''), newP = '+' + np.replace(/\D/g, '')
  const upload = async (blob: Blob) => {
    setUpBusy(true); setCropFile(null)
    const path = `${user.id}/${Date.now()}.jpg`
    const { error } = await db.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' })
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
      {step === 'new' && <><label>{t('new_phone')}</label><input dir="ltr" inputMode="tel" placeholder="+9715XXXXXXXX" value={np} onChange={e => setNp(e.target.value)} />
        <button className="btn full" disabled={np.replace(/\D/g, '').length < 8} onClick={sendNew}>{t('send_code')}</button></>}
      {step === 'newcode' && <><p className="muted">{t('new_code_sent')}</p><input dir="ltr" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn gold full" disabled={!code} onClick={verifyNew}>{t('verify')}</button></>}
      {msg && <p className="muted" style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>{msg}</p>}
      <h3 style={{ marginTop: 20 }}>{t('purchases')}</h3>
      {buys.length === 0 ? <div className="empty">{t('no_purchases')}</div> : <div className="bidlist">{buys.map(i => (
        <div className="person" key={i.id}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 10, background: '#eadcc5', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {i.image_url ? <img src={i.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <b dir="ltr" style={{ fontSize: 11 }}>{i.ref_code || '📿'}</b>}</div>
            <div><b>{i.name}</b><br /><small className="muted">{i.vendors?.name} · {i.closed_at ? new Date(i.closed_at).toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-GB') : ''}</small></div></div>
          <b>{fmt(i.current_price_fils, lang, i.vendors?.currency)}</b></div>))}</div>}
      <button className="btn red full" onClick={signOut}>{t('logout')}</button>
      {cropFile && <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={upload} />}
    </div></div>
  )
}
