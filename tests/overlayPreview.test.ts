import { describe, expect, it } from 'vitest'
import { applyPreviewAction, createOverlayPreview, OVERLAY_PREVIEWS } from '../src/main/session/overlayPreview'
import { OverlayStateSchema } from '../src/shared/types'

describe('overlay preview', () => {
  it('produces valid overlay states throughout the preview cycle', () => {
    for (const preview of OVERLAY_PREVIEWS) {
      expect(OverlayStateSchema.safeParse(createOverlayPreview(preview, 1000)).success).toBe(true)
    }
    expect(new Set(OVERLAY_PREVIEWS).size).toBe(OVERLAY_PREVIEWS.length)
  })

  it('shows every component together with display-normalized anchors', () => {
    const state = createOverlayPreview('all', 1000)
    expect(state.pill.state).toBe('CHECKIN')
    expect(state.nudge?.text).toBeTruthy()
    expect(state.arrow).toEqual({ x: 0.3, y: 0.12, label: 'Your essay’s here' })
    expect(state.notes).toHaveLength(1)
    expect(state.notes[0]?.expiresAt).toBe(181_000)
    expect(state.caption).toBeTruthy()
  })

  it('dismisses only the requested note without mutating the incoming view', () => {
    const state = createOverlayPreview('all', 1000)
    expect(applyPreviewAction(state, { kind: 'dismiss-note', id: 'unknown' }, 2000).notes).toHaveLength(1)
    expect(applyPreviewAction(state, { kind: 'dismiss-note', id: 'preview-note' }, 2000).notes).toHaveLength(0)
    expect(state.notes).toHaveLength(1)
  })

  it('simulates pause, resume, allow, snooze, and return from the same action contract', () => {
    const state = createOverlayPreview('all', 1000)
    expect(applyPreviewAction(state, { kind: 'pause' }, 2000).pill.state).toBe('PAUSED')
    for (const kind of ['resume', 'allow'] as const) {
      const result = applyPreviewAction(state, { kind }, 2000)
      expect(result.pill.state).toBe('FOCUSED')
      expect(result.nudge).toBeUndefined()
    }
    expect(applyPreviewAction(state, { kind: 'snooze' }, 2000).pill.snoozeUntil).toBe(302_000)
    const returned = applyPreviewAction(state, { kind: 'take-me-back' }, 2000)
    expect(returned.pill.state).toBe('FOCUSED')
    expect(returned.nudge).toBeUndefined()
    expect(returned.notes).toHaveLength(1)
    expect(state.pill.state).toBe('CHECKIN')
  })
})
