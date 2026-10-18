import { describe, expect, it } from 'vitest'
import { adaptiveGraceMs } from '../src/shared/grace'
import { DEFAULTS, DEMO } from '../src/shared/config'

describe('adaptive grace selection', () => {
  it('uses 90 seconds until five valid observations and honors opt-out and demo timing', () => {
    expect(adaptiveGraceMs([])).toBe(DEFAULTS.graceMs)
    expect(adaptiveGraceMs([10_000, 20_000, 30_000, 40_000])).toBe(DEFAULTS.graceMs)
    expect(adaptiveGraceMs([1, -1, NaN, Infinity, 900_000])).toBe(DEFAULTS.graceMs)
    expect(adaptiveGraceMs(Array(20).fill(10_000), false)).toBe(DEFAULTS.graceMs)
    expect(adaptiveGraceMs(Array(20).fill(150_000), true, true)).toBe(DEMO.graceMs)
  })
  it('gives the 75th-percentile return another 15 seconds without mutating history', () => {
    const history = [40_000, 20_000, 30_000, 10_000, 35_000]
    expect(adaptiveGraceMs(history)).toBe(50_000)
    expect(history).toEqual([40_000, 20_000, 30_000, 10_000, 35_000])
  })
  it('bounds timing, rounds upward to five seconds, and uses only the latest 20 returns', () => {
    expect(adaptiveGraceMs(Array(20).fill(5_000))).toBe(45_000)
    expect(adaptiveGraceMs(Array(20).fill(600_000))).toBe(180_000)
    expect(adaptiveGraceMs(Array(5).fill(32_001))).toBe(50_000)
    expect(adaptiveGraceMs([...Array(20).fill(600_000), ...Array(20).fill(5_000)])).toBe(45_000)
    expect(adaptiveGraceMs([...Array(5).fill(20_000), 600_000])).toBe(45_000)
  })
})
