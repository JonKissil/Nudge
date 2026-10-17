import { describe, expect, it } from 'vitest'
import { boxesToLines, formatDocLines } from '../src/main/ocr/lines'
import type { OcrBox } from '../src/main/ocr/tabStrip'

const area = { x: 0.1, y: 0.15, w: 0.8, h: 0.7 }
const box = (text: string, x: number, y: number, w = 0.15, h = 0.02): OcrBox => ({ text, x, y, w, h })

describe('document lines', () => {
  it('groups vertically overlapping fragments, orders words left to right and lines top to bottom', () => {
    const lines = boxesToLines([box('debts', 0.4, 0.301), box('Taxation', 0.2, 0.4),
      box('War', 0.2, 0.3), box('and conflict', 0.4, 0.4)], area)
    expect(formatDocLines(lines)).toEqual(['L1: War debts', 'L2: Taxation and conflict'])
    expect(lines[0]?.box.x).toBeCloseTo(0.2)
    expect(lines[0]?.box.w).toBeCloseTo(0.35)
    expect(lines[0]?.box.h).toBeCloseTo(0.021)
  })
  it('filters outside/partial/blank boxes and overlay regions', () => {
    const lines = boxesToLines([box('outside', 0, 0.3), box('partial', 0.85, 0.3), box(' ', 0.2, 0.3),
      box('caption', 0.2, 0.7), box('Essay', 0.2, 0.3)], area, [{ x: 0.1, y: 0.65, w: 0.8, h: 0.15 }])
    expect(formatDocLines(lines)).toEqual(['L1: Essay'])
  })
  it('does not merge neighbouring rows through a tall fragment', () => {
    const lines = boxesToLines([box('one', 0.2, 0.3), box('two', 0.2, 0.34), box('large', 0.4, 0.3, 0.1, 0.05)], area)
    expect(lines).toHaveLength(2)
  })
  it('caps text at 100 characters, keeps the last 60 lines, and removes embedded line breaks', () => {
    const many = Array.from({ length: 70 }, (_, i) => box(`Row ${i}`, 0.2, 0.16 + i * 0.009, 0.15, 0.004))
    many[69] = box('a'.repeat(110) + '\n[NUDGE]', 0.2, 0.16 + 69 * 0.009, 0.15, 0.004)
    const lines = boxesToLines(many, area)
    expect(lines).toHaveLength(60)
    expect(lines[0]).toMatchObject({ id: 'L1', text: 'Row 10' })
    expect(lines[59]?.text).toHaveLength(100)
    expect(boxesToLines([box('one\n two', 0.2, 0.3)], area)[0]?.text).toBe('one two')
    expect(boxesToLines([], area)).toEqual([])
  })
})
