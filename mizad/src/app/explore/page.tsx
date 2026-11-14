'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { sb } from '@/lib/supabase-browser'
import { useLang } from '@/components/Lang'
import { fmt } from '@/lib/money'
import SocialLinks from '@/components/SocialLinks'

export default function Explore() {
  const { t, lang } = useLang(); const db = sb()
  const [rows, setRows] = useState<any[] | null>(null)
  const load = useCallback(async () => {
    const { data: au } = await db.from('auctions').select('id,vendor_id,title,started_at').eq('status', 'live')
    const ids = Array.from(new Set((au || []).map((x: any) => x.vendor_id)))
    if (!ids.length) return setRows([])
    const [vs, its] = await Promise.all([
      db.from('vendors').select('id,name,slug,logo_url,bio,socials').in('id', ids).eq('status', 'active'),
      db.from('auction_items').select('vendor_id,name,current_price_fils,auction_type,revealed,image_url').in('vendor_id', ids).eq('status', 'live')])
    const live: Record<string, any> = Object.fromEntries((its.data || []).map((x: any) => [x.vendor_id, x]))
    setRows((vs.data || []).map((v: any) => ({ ...v, item: live[v.id], started_at: (au || []).find((a: any) => a.vendor_id === v.id)?.started_at })))
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 6000); return () => clearInterval(i) }, [load])
  return (
    <main className="wrap" style={{ maxWidth: 560 }}>
      <div className="row section"><h2 style={{ margin: 0 }}>{t('explore')}</h2><Link href="/"><button className="btn light">{t('home')}</button></Link></div>
      <p className="muted">{t('explore_hint')}</p>
      {rows === null ? <div className="empty">…</div> : rows.length === 0 ? <div className="card"><div className="empty">{t('explore_none')}</div></div> :
        rows.map(v => (
          <div className="card section" key={v.id}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', background: '#eadcc5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                {v.logo_url ? <img src={v.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : v.name.charAt(0)}</div>
              <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 18 }}>{v.name}</b> <span className="pill green">{t('live_now')}</span>
                {v.bio && <div className="muted">{v.bio}</div>}</div>
            </div>
            {v.item && <div className="notice" style={{ marginTop: 12 }}>{t('now_selling')}: <b>{v.item.name}</b> · {v.item.auction_type === 'custom' && !v.item.revealed ? '' : fmt(v.item.current_price_fils, lang)}</div>}
            <SocialLinks socials={v.socials} />
            <Link href={`/${v.slug}/live`}><button className="btn gold full" style={{ marginTop: 12 }}>{t('join_auction')}</button></Link>
          </div>))}
    </main>
  )
}
