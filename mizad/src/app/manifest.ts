import type { MetadataRoute } from 'next'
// Lets bidders and hosts add MazadBoss to their Home Screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MazadBoss', short_name: 'MazadBoss', description: 'Live auctions, organized.',
    start_url: '/', scope: '/', display: 'standalone', background_color: '#20211f', theme_color: '#20211f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
