// Money is ALWAYS integer fils. Formatting divides by 100 for display only.
export const fmt = (fils: number, lang = 'ar') =>
  new Intl.NumberFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: fils % 100 ? 2 : 0 }).format(fils / 100)
// "12.50" -> 1250 without floating point
export function aedToFils(s: string) {
  const [a, b = ''] = s.trim().split('.')
  return parseInt(a || '0', 10) * 100 + parseInt((b + '00').slice(0, 2), 10)
}
