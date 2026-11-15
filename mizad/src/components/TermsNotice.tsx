'use client'
import Link from 'next/link'
import { useLang } from './Lang'

// "By signing up you agree to the Terms and Conditions. To view them click here."
export default function TermsNotice() {
  const { t } = useLang()
  return <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>{t('terms_agree')} <Link href="/terms" target="_blank" style={{ fontWeight: 700 }}>{t('terms_click')}</Link></p>
}
