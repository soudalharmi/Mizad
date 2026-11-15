// MazadBoss service worker: shows push notifications and opens the auction when one is tapped.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (_) { d = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'MazadBoss', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: d.tag || 'mazadboss', renotify: true, dir: d.dir || 'auto', lang: d.lang || '', data: { url: d.url || '/' },
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if (w.url === url && 'focus' in w) return w.focus() }
    return self.clients.openWindow(url)
  }))
})
