import { HabitEventSchema, type HabitEvent } from '../../shared/habits'
import { matchWindow } from '../drift/matchWindow'
import type { StudyEvent, StudyState } from './stateMachine'

export interface HabitEpisode { id: string; since: number; nudgedAfterMs?: number; assisted: boolean }

/** Pure observation; no window names, URLs, task text, speech, or screenshots enter history. */
export function observeHabitEpisode(
  episode: HabitEpisode | undefined, previous: StudyState, next: StudyState,
  action: StudyEvent, now: number, newId: string,
): { episode?: HabitEpisode; event?: HabitEvent } {
  const graceMs = next.config.graceMs
  if (action.type === 'SNOOZE' && previous.phase === 'CHECKIN' && next.phase === 'SNOOZED') {
    return { event: { id: newId, kind: 'snooze', graceMs, minutes: action.minutes } }
  }
  if (['IDLE', 'SETUP', 'PAUSED', 'ENDED', 'SNOOZED'].includes(next.phase)
    || action.type === 'WINDOW_UNAVAILABLE') return {}
  if (previous.phase === 'FOCUSED' && next.phase === 'DRIFTING' && next.driftSince !== undefined) {
    return { episode: { id: newId, since: next.driftSince, assisted: false } }
  }
  if (!episode) return {}
  if (next.phase === 'NUDGING' && previous.phase === 'DRIFTING') {
    const durationMs = now - episode.since
    const event = HabitEventSchema.safeParse({ id: episode.id, kind: 'nudge', graceMs, durationMs })
    return { episode: { ...episode, nudgedAfterMs: durationMs }, event: event.success ? event.data : undefined }
  }
  if (next.phase === 'RETURNING') return { episode: { ...episode, assisted: true } }
  if (next.phase === 'FOCUSED' || next.phase === 'REENTRY') {
    if (!next.currentWindow || !next.taskWindow || !matchWindow(next.currentWindow, next.taskWindow)) return {}
    const event = HabitEventSchema.safeParse({ id: episode.id, graceMs, durationMs: now - episode.since,
      ...(episode.nudgedAfterMs === undefined ? { kind: 'spontaneous-return' } : {
        kind: episode.assisted ? 'assisted-return' : 'independent-return', nudgedAfterMs: episode.nudgedAfterMs,
      }),
    })
    return { event: event.success ? event.data : undefined }
  }
  return { episode }
}
