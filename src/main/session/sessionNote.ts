import { NormalizedBoxSchema } from '../../shared/types'
import type { NormalizedBox, NoteView, WindowBounds, WindowInfo } from '../../shared/types'

const NOTE_LIFETIME_MS = 3 * 60_000
const NOTE_WIDTH = 272

function unit(value: number): number { return Math.max(0, Math.min(1, value)) }

/** Place a note inside the task window's right margin when no OCR line box is available. */
export function marginAnchor(taskWindow: WindowInfo | undefined, display: WindowBounds): NormalizedBox {
  if (!taskWindow) return { x: 0.68, y: 0.4, w: 0, h: 0 }
  const task = taskWindow.bounds
  const left = Math.min(task.x + task.width - NOTE_WIDTH - 24, display.x + display.width - NOTE_WIDTH - 16)
  return {
    x: unit((left - 12 - display.x) / display.width),
    y: unit((task.y + task.height * 0.4 - display.y) / display.height),
    w: 0, h: 0,
  }
}

export function createSessionNote(
  id: string, text: string, taskWindow: WindowInfo | undefined, display: WindowBounds,
  now: number, lineAnchor?: NormalizedBox,
): NoteView {
  return {
    id, text, anchor: lineAnchor && NormalizedBoxSchema.safeParse(lineAnchor).success
      ? lineAnchor : marginAnchor(taskWindow, display),
    expiresAt: now + NOTE_LIFETIME_MS,
  }
}

export function visibleNotes(notes: readonly NoteView[], now: number): NoteView[] {
  return notes.filter((note) => note.expiresAt > now)
}
