// Small browser checks shared by the install and notification prompts.
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true)
export const isIOS = () => typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
export const inAppBrowser = () => typeof navigator !== 'undefined' && /BytedanceWebview|musical_ly|TikTok|Instagram|FBAN|FBAV|Snapchat/i.test(navigator.userAgent)
export const isMobile = () => typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent) || isIOS()
export const snoozed = (k: string) => { try { return Number(localStorage.getItem(k) || 0) > Date.now() } catch { return false } }
export const snooze = (k: string, days = 7) => { try { localStorage.setItem(k, String(Date.now() + days * 864e5)) } catch {} }
