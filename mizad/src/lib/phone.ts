// Phone numbers are always stored and compared as +<country><number>, e.g. +971501234567.
// Accepts what people actually type: +971…, 00971…, 971…, or a local 05… number with a chosen country.
export const COUNTRIES = [
  { iso: 'AE', dial: '971', flag: '🇦🇪', ar: 'الإمارات', en: 'UAE' },
  { iso: 'SA', dial: '966', flag: '🇸🇦', ar: 'السعودية', en: 'Saudi Arabia' },
  { iso: 'KW', dial: '965', flag: '🇰🇼', ar: 'الكويت', en: 'Kuwait' },
  { iso: 'QA', dial: '974', flag: '🇶🇦', ar: 'قطر', en: 'Qatar' },
  { iso: 'BH', dial: '973', flag: '🇧🇭', ar: 'البحرين', en: 'Bahrain' },
  { iso: 'OM', dial: '968', flag: '🇴🇲', ar: 'عُمان', en: 'Oman' },
  { iso: 'IQ', dial: '964', flag: '🇮🇶', ar: 'العراق', en: 'Iraq' },
  { iso: 'JO', dial: '962', flag: '🇯🇴', ar: 'الأردن', en: 'Jordan' },
  { iso: 'EG', dial: '20', flag: '🇪🇬', ar: 'مصر', en: 'Egypt' },
  { iso: 'LB', dial: '961', flag: '🇱🇧', ar: 'لبنان', en: 'Lebanon' },
  { iso: 'SY', dial: '963', flag: '🇸🇾', ar: 'سوريا', en: 'Syria' },
  { iso: 'PS', dial: '970', flag: '🇵🇸', ar: 'فلسطين', en: 'Palestine' },
  { iso: 'YE', dial: '967', flag: '🇾🇪', ar: 'اليمن', en: 'Yemen' },
  { iso: 'SD', dial: '249', flag: '🇸🇩', ar: 'السودان', en: 'Sudan' },
  { iso: 'LY', dial: '218', flag: '🇱🇾', ar: 'ليبيا', en: 'Libya' },
  { iso: 'MA', dial: '212', flag: '🇲🇦', ar: 'المغرب', en: 'Morocco' },
  { iso: 'DZ', dial: '213', flag: '🇩🇿', ar: 'الجزائر', en: 'Algeria' },
  { iso: 'TN', dial: '216', flag: '🇹🇳', ar: 'تونس', en: 'Tunisia' },
  { iso: 'TR', dial: '90', flag: '🇹🇷', ar: 'تركيا', en: 'Türkiye' },
  { iso: 'IN', dial: '91', flag: '🇮🇳', ar: 'الهند', en: 'India' },
  { iso: 'PK', dial: '92', flag: '🇵🇰', ar: 'باكستان', en: 'Pakistan' },
  { iso: 'PH', dial: '63', flag: '🇵🇭', ar: 'الفلبين', en: 'Philippines' },
  { iso: 'GB', dial: '44', flag: '🇬🇧', ar: 'بريطانيا', en: 'United Kingdom' },
  { iso: 'US', dial: '1', flag: '🇺🇸', ar: 'أمريكا / كندا', en: 'USA / Canada' },
]
const BY_LEN = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)

// Full international form from anything typed. With `dial`, a number without a country code is treated as local.
export function normalizePhone(raw: string, dial?: string) {
  const s = String(raw || '').trim()
  let d = s.replace(/\D/g, '')
  if (!d) return ''
  if (s.startsWith('+')) return '+' + d
  if (d.startsWith('00')) return '+' + d.slice(2)
  if (dial) {
    if (d.startsWith(dial) && d.length > dial.length + 6) return '+' + d   // typed the country code without + or 00
    d = d.replace(/^0+/, '')                                           // local trunk zero: 050… -> 50…
    return '+' + dial + d
  }
  return '+' + d
}

// Splits +971501234567 into { dial: '971', local: '501234567' } for the country picker.
export function splitPhone(e164: string, fallback = '971') {
  const d = String(e164 || '').replace(/\D/g, '')
  const c = BY_LEN.find(x => d.startsWith(x.dial))
  return c ? { dial: c.dial, local: d.slice(c.dial.length) } : { dial: fallback, local: d }
}
