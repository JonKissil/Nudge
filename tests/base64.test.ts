import { describe, expect, it } from 'vitest'
import { isBase64 } from '../src/shared/base64'

describe('media base64 validation', () => {
  it('accepts ordinary, padded, and binary base64', () => {
    for (const value of ['AAAA', 'AA==', 'AAA=', '+/8=', 'aGVsbG8=']) expect(isBase64(value)).toBe(true)
  })

  it('rejects bad lengths, misplaced/excess padding, whitespace, and non-base64 text', () => {
    for (const value of ['', 'A', 'AA', 'AAA', 'A===', '====', '=AAA', 'AA=A', 'AA==AAAA',
      'AA\nA', 'AAAA\n', ' AAA', 'A A=', 'AA-_', '日本語=', 'data:image/png;base64,AAAA']) {
      expect(isBase64(value), value).toBe(false)
    }
  })
})
