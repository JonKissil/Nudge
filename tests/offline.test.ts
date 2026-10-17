import { describe, expect, it } from 'vitest'
import { effectiveVerdict } from '../src/main/session/offline'

describe('offline window judgment', () => {
  it('treats ambiguous windows generously while keeping clear blocks', () => {
    expect(effectiveVerdict('ask', 'degraded')).toBe('on')
    expect(effectiveVerdict('off', 'degraded')).toBe('off')
    expect(effectiveVerdict('ignore', 'degraded')).toBe('ignore')
    expect(effectiveVerdict('ask', 'connected')).toBe('ask')
  })
})
