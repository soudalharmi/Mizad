export const PLATFORMS: { k: string; label: string; base: string }[] = [
  { k: 'tiktok', label: 'TikTok', base: 'https://www.tiktok.com/@' },
  { k: 'instagram', label: 'Instagram', base: 'https://www.instagram.com/' },
  { k: 'snapchat', label: 'Snapchat', base: 'https://www.snapchat.com/add/' },
  { k: 'youtube', label: 'YouTube', base: 'https://www.youtube.com/@' },
  { k: 'x', label: 'X', base: 'https://x.com/' },
  { k: 'whatsapp', label: 'WhatsApp', base: 'https://wa.me/' },
  { k: 'website', label: 'Website', base: 'https://' },
]
// Accepts a handle or a full link; only ever returns http(s) links.
export function socialUrl(k: string, raw?: string): string {
  const v = (raw || '').trim(); if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^[\w.-]+:\d+/.test(v)) return ''
  const p = PLATFORMS.find(x => x.k === k); if (!p) return ''
  if (k === 'whatsapp') { const d = v.replace(/\D/g, ''); return d ? p.base + d : '' }
  return p.base + v.replace(/^@/, '')
}
