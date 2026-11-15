import './globals.css'
import { LangProvider } from '@/components/Lang'
import Header from '@/components/Header'
export const metadata = { title: 'Mizad | مِزاد', description: 'Run and manage live auctions' }
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl"><body><LangProvider><Header />{children}</LangProvider></body></html>
  )
}
