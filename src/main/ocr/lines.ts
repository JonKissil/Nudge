import type { NormalizedBox } from '../../shared/types'
import type { OcrBox } from './tabStrip'

export interface DocumentLine { id: string; text: string; box: NormalizedBox }

function inside(box: NormalizedBox, bounds: NormalizedBox): boolean {
  return box.w > 0 && box.h > 0 && box.x >= bounds.x - 1e-6 && box.y >= bounds.y - 1e-6
    && box.x + box.w <= bounds.x + bounds.w + 1e-6 && box.y + box.h <= bounds.y + bounds.h + 1e-6
}

function intersects(a: NormalizedBox, b: NormalizedBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function union(boxes: readonly OcrBox[]): NormalizedBox {
  const x = Math.min(...boxes.map((box) => box.x)), y = Math.min(...boxes.map((box) => box.y))
  return { x, y, w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y }
}

/** All coordinates are relative to the display, regardless of the OCR engine or Retina scale. */
export function boxesToLines(boxes: readonly OcrBox[], bounds: NormalizedBox,
  excluded: readonly NormalizedBox[] = []): DocumentLine[] {
  const ordered = boxes.filter((box) => box.text.trim() && inside(box, bounds)
    && !excluded.some((area) => intersects(box, area)))
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const groups: OcrBox[][] = []
  for (const box of ordered) {
    const row = [...groups].reverse().find((group) => {
      // Compare against the first fragment so tall boxes cannot join successive lines transitively.
      const first = group[0]!
      const overlap = Math.min(first.y + first.h, box.y + box.h) - Math.max(first.y, box.y)
      return overlap / Math.min(first.h, box.h) >= 0.5
    })
    if (row) row.push(box)
    else groups.push([box])
  }
  return groups.map((group) => ({
    text: [...group.sort((a, b) => a.x - b.x).map((box) => box.text.trim()).join(' ').replace(/\s+/gu, ' ')].slice(0, 100).join(''),
    box: union(group),
  })).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    // Retain the end of the visible document, where the student most likely stopped.
    .slice(-60).map((line, index) => ({ ...line, id: `L${index + 1}` }))
}

export function formatDocLines(lines: readonly DocumentLine[]): string[] {
  return lines.map((line) => `${line.id}: ${line.text}`)
}
