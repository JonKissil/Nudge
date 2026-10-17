/** Maximum absolute amplitude in a base64-encoded, little-endian PCM16 chunk. */
export function pcm16Peak(pcm16Base64: string): number {
  const bytes = atob(pcm16Base64)
  let peak = 0
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const unsigned = bytes.charCodeAt(index) | (bytes.charCodeAt(index + 1) << 8)
    const signed = unsigned >= 32768 ? unsigned - 65536 : unsigned
    peak = Math.max(peak, Math.abs(signed) / 32768)
  }
  return peak
}
