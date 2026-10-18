import type { PillState, SessionState } from '../../shared/types'
import { OverlayButton, type OverlayControls } from './OverlayButton'
import styles from './Overlay.module.css'

const labels: Record<SessionState, string> = {
  IDLE: 'Ready when you are', SETUP: 'Getting ready', FOCUSED: 'Here with you',
  DRIFTING: 'Here with you', NUDGING: 'A gentle check-in', CHECKIN: 'Listening',
  RETURNING: 'Finding your place', REENTRY: 'One small step', SNOOZED: 'Taking a break',
  PAUSED: 'Paused', ENDED: 'All done',
}

export function Pill({ pill, now, onAction, onInteractive }: OverlayControls & { pill: PillState; now: number }) {
  const seconds = Math.max(0, Math.ceil(((pill.snoozeUntil ?? now) - now) / 1000))
  const remaining = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const paused = pill.state === 'PAUSED'
  const label = pill.micOpen ? 'Listening' : pill.state === 'SNOOZED' ? `Snoozed · ${remaining}`
    : pill.quietMode && pill.state === 'CHECKIN' ? 'Choose what helps' : labels[pill.state]
  return <aside className={styles.pill} aria-label="Nudge session">
    <span className={styles.dot} data-paused={paused || pill.state === 'SNOOZED'} aria-hidden="true" />
    <span className={styles.pillCopy}><strong>Nudge</strong><span>{label}{pill.quietMode && ' · Quiet Mode'}{pill.offline && ' · Offline mode'}</span></span>
    <OverlayButton label={paused ? 'Resume session' : 'Pause session'} onInteractive={onInteractive}
      onClick={() => onAction({ kind: paused ? 'resume' : 'pause' })} secondary>
      <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
    </OverlayButton>
  </aside>
}
