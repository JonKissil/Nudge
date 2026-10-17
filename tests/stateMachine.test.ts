import { describe, expect, it } from 'vitest'
import type { WindowInfo } from '../src/shared/types'
import { createStudyState, reduce, type StudyEvent, type StudyState } from '../src/main/session/stateMachine'

const doc: WindowInfo = {
  app: 'Google Chrome', bundleId: 'com.google.Chrome', title: 'Essay - Google Docs',
  url: 'https://docs.google.com/document/d/abc/edit',
  bounds: { x: 0, y: 0, width: 1280, height: 800 },
}
const video: WindowInfo = { ...doc, title: 'A music video - YouTube', url: 'https://youtube.com/watch?v=123' }
const config = {
  graceMs: 15_000, offTaskConfidence: 0.6, checkinSilenceMs: 12_000,
  silentSnoozeMs: 120_000, returnTimeoutMs: 60_000, maxNudgesPer10Min: 3,
}

function setup(): StudyState {
  let state = createStudyState(config)
  state = reduce(state, { type: 'START_SETUP', task: 'History essay', minutes: 30 }, 0).state
  return reduce(state, { type: 'LOCK_WINDOW', window: doc }, 0).state
}

function step(state: StudyState, event: StudyEvent, now: number): StudyState {
  return reduce(state, event, now).state
}

function checkin(now = 15_000): StudyState {
  let state = step(setup(), { type: 'WINDOW_OBSERVED', window: video, verdict: 'off', matchesTask: false }, 0)
  state = step(state, { type: 'TICK' }, now)
  return step(state, { type: 'NUDGE_SENT' }, now)
}

describe('study session reducer', () => {
  it('refreshes only the locked task URL without resetting focus or accepting another document', () => {
    const state = setup()
    const updated = reduce(state, { type: 'TASK_URL_UPDATED', url: `${doc.url}?tab=2#heading` }, 10_000)
    expect(updated.state.taskWindow?.url).toBe(`${doc.url}?tab=2#heading`)
    expect(updated.state.phase).toBe('FOCUSED')
    expect(updated.effects).toEqual([])
    expect(reduce(updated.state, { type: 'TASK_URL_UPDATED', url: video.url! }, 20_000).state).toBe(updated.state)
    const ended = step(updated.state, { type: 'END' }, 20_000)
    expect(reduce(ended, { type: 'TASK_URL_UPDATED', url: doc.url! }, 21_000).state).toBe(ended)
  })
  it('moves from setup to focused with one Live connection and greeting', () => {
    const initial = createStudyState(config)
    const setupResult = reduce(initial, { type: 'START_SETUP', task: 'History essay', minutes: 30 }, 0)
    expect(setupResult.state.phase).toBe('SETUP')
    const locked = reduce(setupResult.state, { type: 'LOCK_WINDOW', window: doc }, 100)
    expect(locked.state.phase).toBe('FOCUSED')
    expect(locked.effects.map((effect) => effect.type)).toEqual(['CONNECT_LIVE', 'START_CAPTURE', 'SEND_TURN'])
    expect(locked.effects[2]).toMatchObject({ turn: { tag: 'SESSION_START', turnComplete: true } })
  })

  it('switches demo timing without resetting the active task or drift timer', () => {
    const drifting = step(setup(), { type: 'WINDOW_OBSERVED', window: video, verdict: 'off', matchesTask: false }, 1000)
    const updated = reduce(drifting, { type: 'SET_CONFIG', config: { ...config, graceMs: 90_000 } }, 5000)
    expect(updated.state.taskWindow).toEqual(doc)
    expect(updated.state.driftSince).toBe(1000)
    expect(step(updated.state, { type: 'TICK' }, 16_000).phase).toBe('DRIFTING')
  })

  it('asks about ambiguous windows, accepts generous judgments, and ignores our own window', () => {
    let state = setup()
    const asked = reduce(state, { type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 1000)
    expect(asked.effects).toMatchObject([{ type: 'SEND_TURN', turn: { tag: 'CHECK' } }])
    state = asked.state
    expect(reduce(state, { type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 2000).effects).toEqual([])
    state = step(state, { type: 'MODEL_STATUS', status: { on_task: false, activity: 'Maybe a lecture', confidence: 0.4 } }, 3000)
    expect(state.phase).toBe('FOCUSED')
    state = step(state, { type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 4000)
    state = step(state, { type: 'MODEL_STATUS', status: { on_task: false, activity: 'Watching music video', confidence: 0.9 } }, 5000)
    expect(state.phase).toBe('DRIFTING')
    expect(state.driftSince).toBe(5000)
    state = step(state, { type: 'WINDOW_OBSERVED', window: doc, verdict: 'on', matchesTask: true }, 6000)
    expect(state.phase).toBe('FOCUSED')
    expect(state.driftSince).toBeUndefined()
    expect(reduce(state, { type: 'WINDOW_OBSERVED', window: doc, verdict: 'ignore', matchesTask: false }, 7000).effects).toEqual([])
  })

  it('releases a failed check without changing the last verdict or drift timer', () => {
    let state = step(setup(), { type: 'WINDOW_OBSERVED', window: video, verdict: 'off', matchesTask: false }, 1000)
    state = step(state, { type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 2000)
    expect(state.checkPending).toBe(true)
    const failed = reduce(state, { type: 'CHECK_FAILED' }, 3000)
    expect(failed.state.phase).toBe('DRIFTING')
    expect(failed.state.driftSince).toBe(1000)
    expect(failed.state.checkPending).toBe(false)
    expect(failed.effects).toEqual([])
    const next = reduce(failed.state, { type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 4000)
    expect(next.effects).toMatchObject([{ type: 'SEND_TURN', turn: { tag: 'CHECK' } }])
  })

  it('applies grace and rate limits, then opens check-in without more checks', () => {
    let state = step(setup(), { type: 'WINDOW_OBSERVED', window: video, verdict: 'off', matchesTask: false }, 0)
    expect(step(state, { type: 'TICK' }, 14_999).phase).toBe('DRIFTING')
    const nudge = reduce(state, { type: 'TICK' }, 15_000)
    expect(nudge.state.phase).toBe('NUDGING')
    expect(nudge.effects.map((effect) => effect.type)).toEqual(['SEND_TURN', 'SHOW_NUDGE', 'OPEN_MIC'])
    state = step(nudge.state, { type: 'NUDGE_SENT' }, 15_000)
    expect(state.phase).toBe('CHECKIN')
    expect(reduce(state, { type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 16_000).effects).toEqual([])
    state = { ...state, phase: 'DRIFTING', driftSince: 0, nudgeTimes: [1, 2, 3] }
    expect(step(state, { type: 'TICK' }, 16_000).phase).toBe('DRIFTING')
    expect(step(state, { type: 'TICK' }, 600_004).phase).toBe('NUDGING')
  })

  it('snoozes after check-in silence and resumes without a spoken turn', () => {
    let state = checkin()
    state = step(state, { type: 'USER_SPEECH' }, 20_000)
    expect(step(state, { type: 'TICK' }, 31_999).phase).toBe('CHECKIN')
    const snoozed = reduce(state, { type: 'TICK' }, 32_000)
    expect(snoozed.state.phase).toBe('SNOOZED')
    expect(snoozed.effects.map((effect) => effect.type)).toEqual(['CLOSE_MIC', 'SET_CHECKIN_ACTIVE', 'HIDE_NUDGE'])
    expect(step(snoozed.state, { type: 'TICK' }, 151_999).phase).toBe('SNOOZED')
    const awake = reduce(snoozed.state, { type: 'TICK' }, 152_000)
    expect(awake.state.phase).toBe('FOCUSED')
    expect(awake.effects).toMatchObject([{ type: 'SEND_TURN', turn: { tag: 'SNOOZE_OVER', turnComplete: false } }])
    expect(step(checkin(), { type: 'END_CHECKIN' }, 16_000).phase).toBe('SNOOZED')
    expect(step(checkin(), { type: 'SNOOZE', minutes: 5 }, 16_000).snoozeUntil).toBe(316_000)
  })

  it('supports focus, guided, and self-return routes through reentry', () => {
    for (const mode of ['focused', 'guided'] as const) {
      let state = checkin()
      const returning = reduce(state, { type: 'RETURN_REQUEST', mode }, 16_000)
      expect(returning.state.phase).toBe('RETURNING')
      expect(returning.effects).toContainEqual({ type: mode === 'focused' ? 'FOCUS_TASK' : 'GUIDE_TASK' })
      state = step(returning.state, { type: 'WINDOW_OBSERVED', window: doc, verdict: 'on', matchesTask: true }, 17_000)
      expect(state.phase).toBe('REENTRY')
      expect(step(state, { type: 'TICK' }, 17_799).ocrRequested).toBe(false)
      const ocr = reduce(state, { type: 'TICK' }, 17_800)
      expect(ocr.effects).toEqual([{ type: 'RUN_OCR' }])
      const lines = reduce(ocr.state, { type: 'REENTRY_LINES', lines: ['L1: First sentence'] }, 18_000)
      expect(lines.effects).toMatchObject([{ type: 'SEND_TURN', turn: { tag: 'USER_RETURNED' } }])
      state = step(lines.state, { type: 'PIN_STEP', text: 'What is one cause?', lineId: 'L1' }, 19_000)
      expect(state.phase).toBe('FOCUSED')
      expect(state.lastNextStep).toBe('What is one cause?')
    }
    expect(step(checkin(), { type: 'ARRIVED' }, 16_000).phase).toBe('REENTRY')
  })

  it('times out returning and pins a fallback when no next step arrives', () => {
    let state = step(checkin(), { type: 'RETURN_REQUEST', mode: 'focused' }, 16_000)
    expect(step(state, { type: 'TICK' }, 75_999).phase).toBe('RETURNING')
    expect(step(state, { type: 'TICK' }, 76_000).phase).toBe('DRIFTING')
    state = step(state, { type: 'ARRIVED' }, 17_000)
    const fallback = reduce(state, { type: 'TICK' }, 27_000)
    expect(fallback.state.phase).toBe('FOCUSED')
    expect(fallback.effects).toEqual([{ type: 'PIN_NOTE', text: 'Pick up where you left off ↓', lineId: 'none' }])
  })

  it('allows task windows, pauses, resumes, and ends cleanly', () => {
    const allowed = reduce(checkin(), { type: 'ALLOW_CURRENT' }, 16_000)
    expect(allowed.state.phase).toBe('FOCUSED')
    expect(allowed.effects[0]).toEqual({ type: 'ALLOW_WINDOW' })
    const paused = reduce(allowed.state, { type: 'PAUSE' }, 17_000)
    expect(paused.state.phase).toBe('PAUSED')
    expect(paused.effects.map((effect) => effect.type)).toContain('STOP_CAPTURE')
    const resumed = reduce(paused.state, { type: 'RESUME' }, 18_000)
    expect(resumed.state.phase).toBe('FOCUSED')
    const ended = reduce(resumed.state, { type: 'END' }, 19_000)
    expect(ended.state.phase).toBe('ENDED')
    expect(ended.effects.map((effect) => effect.type)).toContain('DISCONNECT_LIVE')
  })
})
