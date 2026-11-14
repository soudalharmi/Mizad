'use client'
import { PLATFORMS, socialUrl } from '@/lib/social'
export default function SocialLinks({ socials }: { socials?: Record<string, string> | null }) {
  const list = PLATFORMS.map(p => ({ p, url: socialUrl(p.k, socials?.[p.k]) })).filter(x => x.url)
  if (!list.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {list.map(({ p, url }) => <a key={p.k} href={url} target="_blank" rel="noopener noreferrer nofollow" className="pill gold" style={{ textDecoration: 'none' }}>{p.label}</a>)}
    </div>
  )
}
