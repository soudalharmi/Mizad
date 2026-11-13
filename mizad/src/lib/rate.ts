// Tiny per-user limiter. In-memory => per server instance only. Use Upstash/Redis in production.
const hits = new Map<string, number[]>()
export function allow(key: string, max = 8, windowMs = 5000) {
  const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < windowMs)
  if (a.length >= max) return false
  a.push(now); hits.set(key, a); return true
}
