import { z } from 'zod'
import { NormalizedBoxSchema, type ArrowView } from '../../shared/types'

export const OcrBoxSchema = NormalizedBoxSchema.extend({ text: z.string().max(10000) })
export type OcrBox = z.infer<typeof OcrBoxSchema>
export const TAB_STRIP_HEIGHT = 0.12

function titleKey(text: string): string {
  return text.normalize('NFKD').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function similarity(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + Number(a[i - 1] !== b[j - 1]))
    }
    row = next
  }
  return 1 - row[b.length]! / Math.max(a.length, b.length)
}

/** Input boxes are normalized to the cropped strip; output targets the whole display. */
export function findTaskTab(boxes: readonly OcrBox[], title: string): ArrowView | undefined {
  const key = titleKey(title).slice(0, 20)
  if (key.length < 4) return undefined
  const matches = boxes.filter((box) => {
    const candidate = titleKey(box.text).slice(0, 20)
    return candidate.length >= Math.min(8, key.length) && similarity(candidate, key) >= 0.8
  })
  // A repeated title could be a toolbar or another tab; never guess between them.
  if (matches.length !== 1) return undefined
  const box = matches[0]!
  return { x: Math.min(1, box.x + box.w / 2), y: Math.min(1, (box.y + box.h / 2) * TAB_STRIP_HEIGHT), label: 'Your task is here' }
}
