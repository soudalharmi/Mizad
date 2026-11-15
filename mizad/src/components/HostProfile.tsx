'use client'
import { useState } from 'react'
import { sb } from '@/lib/supabase-browser'
import { useLang } from './Lang'
import AvatarCropper from './AvatarCropper'
import { PLATFORMS } from '@/lib/social'
import { CURRENCIES, currencyLabel } from '@/lib/currency'

export default function HostProfile({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const { t, lang } = useLang(); const db = sb()
  const [name, setName] = useState(vendor.name || ''), [bio, setBio] = useState(vendor.bio || ''), [cur, setCur] = useState(vendor.currency || 'AED'), [soc, setSoc] = useState<Record<string, string>>(vendor.socials || {})
  const [logo, setLogo] = useState<string>(vendor.logo_url || ''), [crop, setCrop] = useState<File | null>(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const upload = async (blob: Blob) => {
    setCrop(null); setBusy(true)
    const path = `${vendor.owner_id}/host-${Date.now()}.jpg`
    const { error } = await db.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' })
    setBusy(false); if (error) return setMsg(error.message)
    setLogo(db.storage.from('avatars').getPublicUrl(path).data.publicUrl)
  }
  const save = async () => {
    setBusy(true)
    const clean = Object.fromEntries(Object.entries(soc).map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v))
    const { error } = await db.from('vendors').update({ name: name.trim(), bio: bio.trim() || null, socials: clean, logo_url: logo || null, currency: cur }).eq('id', vendor.id)
    setBusy(false); if (error) return setMsg(error.message.includes('CURRENCY_LOCKED') ? t('CURRENCY_LOCKED') : error.message)
    onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0008', overflowY: 'auto', padding: 16 }}>
      <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="row"><h3 style={{ margin: 0 }}>{t('host_profile')}</h3><button className="btn light" onClick={onClose}>✕</button></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0' }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', background: '#eadcc5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
            {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name || '?').charAt(0)}</div>
          <label className="btn light" style={{ margin: 0, cursor: 'pointer' }}>{t('change_photo')}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCrop(f) }} /></label>
        </div>
        <label>{t('store_name')}</label><input value={name} onChange={e => setName(e.target.value)} />
        <label>{t('currency')}</label><select value={cur} onChange={e => setCur(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{currencyLabel(c, lang)}</option>)}</select>
        <label>{t('bio')}</label><textarea maxLength={300} value={bio} onChange={e => setBio(e.target.value)} />
        <h4 style={{ marginBottom: 0 }}>{t('social_accounts')}</h4><div className="muted">{t('social_hint')}</div>
        {PLATFORMS.map(p => <div key={p.k}><label>{p.label}</label><input dir="ltr" value={soc[p.k] || ''} placeholder={p.k === 'whatsapp' ? '+9715…' : p.k === 'website' ? 'example.com' : '@username'} onChange={e => setSoc({ ...soc, [p.k]: e.target.value })} /></div>)}
        {msg && <div className="notice" style={{ marginTop: 10 }}>{msg}</div>}
        <button className="btn gold full" style={{ marginTop: 14 }} disabled={busy || !name.trim()} onClick={save}>{t('save')}</button>
      </div>
      {crop && <AvatarCropper file={crop} onCancel={() => setCrop(null)} onDone={upload} />}
    </div>
  )
}
