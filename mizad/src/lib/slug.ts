// Turns an auction name (Arabic or English) into a page link, e.g. "المزاد الذهبي" -> "almzad-althhby".
const AR: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ء': '', 'ؤ': 'o', 'ئ': 'e', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'ة': 'a', 'و': 'w', 'ي': 'y', 'ى': 'a',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}
const RESERVED = ['admin', 'dashboard', 'login', 'api', '_next', 'signup', 'explore', 'terms']
export function slugify(name: string) {
  let s = Array.from(String(name || '').toLowerCase()).map(c => (c in AR ? AR[c] : c)).join('')
  s = s.normalize('NFKD').replace(/[̀-ًͯ-ٰٟ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '')
  if (s.length < 3) s = (s + '-auction').replace(/^-/, '')
  if (RESERVED.includes(s)) s = s + '-auction'
  return s.slice(0, 30)
}
