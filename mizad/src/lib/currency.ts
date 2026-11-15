// GCC currencies + USD. Amounts are always stored as integer hundredths ("fils") of the currency.
export const CURRENCIES = [
  { code: 'AED', ar: 'درهم إماراتي', en: 'UAE Dirham' },
  { code: 'SAR', ar: 'ريال سعودي', en: 'Saudi Riyal' },
  { code: 'KWD', ar: 'دينار كويتي', en: 'Kuwaiti Dinar' },
  { code: 'BHD', ar: 'دينار بحريني', en: 'Bahraini Dinar' },
  { code: 'OMR', ar: 'ريال عماني', en: 'Omani Rial' },
  { code: 'QAR', ar: 'ريال قطري', en: 'Qatari Riyal' },
  { code: 'USD', ar: 'دولار أمريكي', en: 'US Dollar ($)' },
]
export const currencyLabel = (c: any, lang: string) => `${lang === 'ar' ? c.ar : c.en} (${c.code})`
