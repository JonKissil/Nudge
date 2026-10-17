/** Validate media payloads without repeated regex groups, which can overflow on large PNGs. */
export function isBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return !/[^A-Za-z0-9+/]/u.test(value.slice(0, value.length - padding))
}
