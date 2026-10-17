import { describe, expect, it } from 'vitest'
import { displayRegion, documentRegion, mapCropBoxes, overlayExclusions } from '../src/main/ocr/geometry'
import type { WindowInfo } from '../src/shared/types'

const display = { x: 100, y: 50, width: 1400, height: 900 }
const window: WindowInfo = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay',
  url: 'https://example.com/essay', bounds: { x: 200, y: 100, width: 1000, height: 700 } }

describe('OCR geometry', () => {
  it('clips windows to the primary display and excludes browser/title bars', () => {
    expect(displayRegion({ x: 0, y: 0, width: 300, height: 200 }, display))
      .toEqual({ x: 0, y: 0, w: 200 / 1400, h: 150 / 900 })
    expect(displayRegion({ x: -1000, y: -1000, width: 100, height: 100 }, display)).toBeUndefined()
    expect(documentRegion(window, display)).toEqual({ x: 100 / 1400, y: 146 / 900, w: 1000 / 1400, h: 580 / 900 })
  })
  it('maps crop boxes into display space without introducing a Retina scale factor', () => {
    const [box] = mapCropBoxes([{ text: 'Essay', x: 0.25, y: 0.5, w: 0.4, h: 0.1 }], { x: 0.1, y: 0.2, w: 0.8, h: 0.6 })
    expect(box?.x).toBeCloseTo(0.3)
    expect(box?.y).toBeCloseTo(0.5)
    expect(box?.w).toBeCloseTo(0.32)
    expect(box?.h).toBeCloseTo(0.06)
  })
  it('excludes our pill and current captions without excluding an empty caption', () => {
    expect(overlayExclusions(display, '')).toHaveLength(1)
    const exclusions = overlayExclusions(display, 'A short spoken prompt')
    expect(exclusions).toHaveLength(2)
    expect(exclusions[1]?.y).toBeGreaterThan(0.8)
  })
})
