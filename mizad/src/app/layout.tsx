import './globals.css'
import { LangProvider } from '@/components/Lang'
import Header from '@/components/Header'
import PwaSetup from '@/components/PwaSetup'
export const metadata = { title: 'Mazad Boss', description: 'Run and manage live auctions', appleWebApp: { capable: true, title: 'MazadBoss', statusBarStyle: 'black' as const } }
export const viewport = { themeColor: '#20211f' }
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl"><body><LangProvider><PwaSetup /><Header />{children}</LangProvider></body></html>
  )
}
