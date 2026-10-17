import { describe, expect, it } from 'vitest'
import { grayscale, frameDifference, shouldSendFrame } from '../src/renderer/media/frameDiff'
import { DEFAULTS } from '../src/shared/config'

describe('frame diff and rate gate', () => {
  const black = new Uint8Array(64 * 36), white = new Uint8Array(64 * 36).fill(255)
  it('converts RGB luminance and ignores alpha', () => {
    expect([...grayscale(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]))]).toEqual([76, 150])
    expect(() => grayscale(new Uint8ClampedArray(3))).toThrow()
  })
  it('normalizes mean absolute difference to 0–1', () => {
    expect(frameDifference(black, black)).toBe(0)
    expect(frameDifference(black, white)).toBe(1)
    expect(() => frameDifference(black, new Uint8Array(1))).toThrow()
  })
  it('sends the first frame, changes, and periodic keyframes', () => {
    expect(shouldSendFrame(black, undefined, undefined, 0, DEFAULTS)).toBe(true)
    expect(shouldSendFrame(white, black, 0, 1000, DEFAULTS)).toBe(true)
    expect(shouldSendFrame(black, black, 0, 4999, DEFAULTS)).toBe(false)
    expect(shouldSendFrame(black, black, 0, 5000, DEFAULTS)).toBe(true)
  })
  it('enforces 1 fps even on large changes or overdue keyframes', () => {
    expect(shouldSendFrame(white, black, 0, 999, DEFAULTS)).toBe(false)
    expect(shouldSendFrame(white, black, 10000, 9000, DEFAULTS)).toBe(false)
  })
  it('compares against the last sent frame so gradual changes accumulate', () => {
    const small = new Uint8Array(black.length).fill(3), accumulated = new Uint8Array(black.length).fill(6)
    expect(shouldSendFrame(small, black, 0, 1000, DEFAULTS)).toBe(false)
    expect(shouldSendFrame(accumulated, black, 0, 2000, DEFAULTS)).toBe(true)
    expect(shouldSendFrame(new Uint8Array(), undefined, undefined, 0, DEFAULTS)).toBe(false)
  })
})
