// Date of birth checks shared by sign-up and password reset.
export function validDob(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false
  const d = new Date(s + 'T00:00:00Z'); if (isNaN(+d)) return false
  return d.getUTCFullYear() >= 1900 && d <= new Date()
}
export function isAdult(s: string) {
  const d = new Date(s + 'T00:00:00Z'), now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) age--
  return age >= 18
}
