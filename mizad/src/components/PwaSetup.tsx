'use client'
import { useEffect } from 'react'
// Registers the service worker once (needed for notifications and for installing MazadBoss as an app).
export default function PwaSetup() {
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}) }, [])
  return null
}
