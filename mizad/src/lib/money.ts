// Money is ALWAYS integer hundredths ("fils") of the currency. Formatting divides by 100 for display only.
// The host's currency is set once per page with setCurrency(); platform fees are always shown with an explicit 'AED'.
let current = 'AED'
export const setCurrency = (c?: string | null) => { current = c || 'AED' }
export const fmt = (fils: number, lang = 'ar', currency?: string | null) =>
  new Intl.NumberFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', { style: 'currency', currency: currency || current, minimumFractionDigits: fils % 100 ? 2 : 0 }).format(fils / 100)
// "12.50" -> 1250 without floating point
export function aedToFils(s: string) {
  const [a, b = ''] = s.trim().split('.')
  return parseInt(a || '0', 10) * 100 + parseInt((b + '00').slice(0, 2), 10)
}
