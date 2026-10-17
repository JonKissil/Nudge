import type { OverlayAction, OverlayPreview, OverlayState } from '../../shared/types'

export const OVERLAY_PREVIEWS: readonly OverlayPreview[] = [
  'hidden', 'focused', 'nudge', 'guide', 'note', 'captions', 'snoozed', 'paused', 'offline', 'all',
]

export function createOverlayPreview(preview: OverlayPreview, now: number): OverlayState {
  const state: OverlayState = { pill: { state: 'FOCUSED', offline: false }, notes: [] }
  if (preview === 'hidden') state.pill.state = 'IDLE'
  if (preview === 'nudge' || preview === 'all') {
    state.pill.state = 'CHECKIN'
    state.nudge = { text: 'Hey, quick check — still with the essay, or taking a break?' }
  }
  if (preview === 'guide' || preview === 'all') {
    state.arrow = { x: 0.3, y: 0.12, label: 'Your essay’s here' }
  }
  if (preview === 'note' || preview === 'all') {
    state.notes = [{
      id: 'preview-note', text: 'What’s one reason the Estates-General was called?',
      anchor: { x: 0.48, y: 0.5, w: 0.16, h: 0.025 }, expiresAt: now + 180_000,
    }]
  }
  if (preview === 'captions' || preview === 'all') state.caption = 'I’ve left one small question beside your essay.'
  if (preview === 'snoozed') state.pill = { state: 'SNOOZED', offline: false, snoozeUntil: now + 300_000 }
  if (preview === 'paused') state.pill.state = 'PAUSED'
  if (preview === 'offline') state.pill.offline = true
  return state
}

// These actions demonstrate the view only. They never focus an app or change session state.
export function applyPreviewAction(state: OverlayState, action: OverlayAction, now: number): OverlayState {
  switch (action.kind) {
    case 'dismiss-note': return { ...state, notes: state.notes.filter((note) => note.id !== action.id) }
    case 'pause': return { pill: { state: 'PAUSED', offline: state.pill.offline }, notes: state.notes }
    case 'resume':
    case 'allow': return { pill: { state: 'FOCUSED', offline: state.pill.offline }, notes: state.notes }
    case 'snooze': return {
      pill: { state: 'SNOOZED', offline: state.pill.offline, snoozeUntil: now + 300_000 }, notes: state.notes,
    }
    case 'take-me-back': return createOverlayPreview('note', now)
  }
}
