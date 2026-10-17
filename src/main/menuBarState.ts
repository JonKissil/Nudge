import type { ConnState, SessionState } from '../shared/types'

export interface MenuBarState {
  illuminated: boolean
  status: string
  canPause: boolean
  canEnd: boolean
  paused: boolean
}

const LABELS: Record<SessionState, string> = {
  IDLE: 'Ready to study', SETUP: 'Setting up', FOCUSED: 'Session active',
  DRIFTING: 'Session active', NUDGING: 'Checking in', CHECKIN: 'Checking in',
  RETURNING: 'Returning to your task', REENTRY: 'Getting started again',
  SNOOZED: 'Snoozed', PAUSED: 'Paused', ENDED: 'Session ended',
}

// Read the real session state, never the development overlay preview or connection alone.
export function menuBarState(state: SessionState, conn: ConnState): MenuBarState {
  const canPause = !['IDLE', 'SETUP', 'ENDED'].includes(state)
  const illuminated = canPause && state !== 'PAUSED'
  return {
    illuminated,
    status: `${LABELS[state]}${illuminated && conn === 'degraded' ? ' · Offline mode' : ''}`,
    canPause, canEnd: state !== 'IDLE' && state !== 'ENDED', paused: state === 'PAUSED',
  }
}
