import { describe, expect, it } from 'vitest'
import type { WindowInfo } from '../src/shared/types'
import { createSessionNote, marginAnchor, visibleNotes } from '../src/main/session/sessionNote'
import { NoteViewSchema } from '../src/shared/types'

const display = { x: 0, y: 0, width: 1408, height: 881 }
const taskWindow: WindowInfo = {
  app: 'Google Chrome', bundleId: 'com.google.Chrome', title: 'Essay - Google Docs',
  url: 'https://docs.google.com/document/d/abc/edit',
  bounds: { x: 80, y: 60, width: 1200, height: 760 },
}

describe('session notes', () => {
  it('places a fallback inside the task window and expires it after three minutes', () => {
    const anchor = marginAnchor(taskWindow, display)
    const left = (anchor.x + anchor.w) * display.width + 12
    expect(left).toBeGreaterThan(taskWindow.bounds.x)
    expect(left + 272).toBeLessThanOrEqual(taskWindow.bounds.x + taskWindow.bounds.width)
    const note = createSessionNote('next-1', 'What is one reason they met?', taskWindow, display, 1000)
    expect(NoteViewSchema.safeParse(note).success).toBe(true)
    expect(visibleNotes([note], 180_999)).toHaveLength(1)
    expect(visibleNotes([note], 181_000)).toHaveLength(0)
  })

  it('uses an OCR anchor when available and stays valid near a display edge', () => {
    const lineAnchor = { x: 0.45, y: 0.55, w: 0.2, h: 0.02 }
    expect(createSessionNote('next-2', 'Where will you start?', taskWindow, display, 0, lineAnchor).anchor)
      .toEqual(lineAnchor)
    expect(createSessionNote('next-2b', 'Where will you start?', taskWindow, display, 0,
      { ...lineAnchor, x: 2 }).anchor).toEqual(marginAnchor(taskWindow, display))
    const edgeWindow = { ...taskWindow, bounds: { x: 1350, y: 800, width: 300, height: 200 } }
    expect(NoteViewSchema.safeParse(createSessionNote('next-3', 'Look at the next line.', edgeWindow, display, 0)).success)
      .toBe(true)
  })

  it('keeps a line note inside the task window instead of overflowing its right or bottom edge', () => {
    const note = createSessionNote('edge', 'What is one cause?', taskWindow, display, 0,
      { x: 0.85, y: 0.85, w: 0.05, h: 0.02 })
    const left = (note.anchor.x + note.anchor.w) * display.width + 12
    expect(left).toBeGreaterThanOrEqual(taskWindow.bounds.x)
    expect(left + 272).toBeLessThanOrEqual(taskWindow.bounds.x + taskWindow.bounds.width)
    expect(note.anchor.y * display.height + 224).toBeLessThanOrEqual(taskWindow.bounds.y + taskWindow.bounds.height)
  })
})
