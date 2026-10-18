import { GraceReturnSchema } from '../../shared/grace'
import { matchWindow } from '../drift/matchWindow'
import type { StudyState } from './stateMachine'

/** Track only uninterrupted, pre-nudge drift followed by a confirmed return to the locked task. */
export function observeGraceReturn(
  since: number | undefined, previous: StudyState, next: StudyState, now: number,
): { since?: number; durationMs?: number } {
  if (next.phase === 'DRIFTING') {
    if (!next.currentWindow) return {}
    if (previous.phase !== 'DRIFTING') {
      return previous.phase === 'FOCUSED' ? { since: next.driftSince } : {}
    }
    return { since }
  }
  if (previous.phase !== 'DRIFTING' || next.phase !== 'FOCUSED' || since === undefined
    || since !== previous.driftSince || !next.currentWindow || !next.taskWindow
    || !matchWindow(next.currentWindow, next.taskWindow)) return {}
  const duration = GraceReturnSchema.safeParse(now - since)
  return duration.success ? { durationMs: duration.data } : {}
}
