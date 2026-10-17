import { describe, expect, it } from 'vitest'
import { findTaskTab, type OcrBox } from '../src/main/ocr/tabStrip'

const box: OcrBox = { text: 'History essay workspace', x: 0.2, y: 0.5, w: 0.15, h: 0.1 }
describe('tab-strip guidance', () => {
  it('finds a title among unrelated tabs and maps crop coordinates to the display', () => {
    const arrow = findTaskTab([{ ...box, text: 'Music videos', x: 0.5 }, box], 'History essay workspace')
    expect(arrow?.x).toBeCloseTo(0.275)
    expect(arrow?.y).toBeCloseTo(0.066)
  })
  it('tolerates punctuation, case and a small OCR error in the first 20 characters', () => {
    expect(findTaskTab([{ ...box, text: 'HISTORY — ESSAY W0RKSPACE' }], box.text)).toBeDefined()
  })
  it('falls back for missing, too short, and ambiguous titles', () => {
    expect(findTaskTab([], box.text)).toBeUndefined()
    expect(findTaskTab([{ ...box, text: 'His' }], box.text)).toBeUndefined()
    expect(findTaskTab([box], 'Hi')).toBeUndefined()
    expect(findTaskTab([box, { ...box, x: 0.7 }], box.text)).toBeUndefined()
    expect(findTaskTab([{ ...box, text: 'History of another subject' }], box.text)).toBeUndefined()
  })
})
