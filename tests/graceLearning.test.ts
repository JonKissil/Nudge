import { describe, expect, it } from 'vitest'
import { observeGraceReturn } from '../src/main/session/graceLearning'
import { createStudyState, reduce, type StudyEvent } from '../src/main/session/stateMachine'
import { adaptiveGraceMs } from '../src/shared/grace'
import { DEFAULTS } from '../src/shared/config'

const task = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay',
  url: 'https://example.test/essay', bounds: { x: 0, y: 0, width: 1200, height: 800 } }
const other = { ...task, title: 'Feed', url: 'https://example.test/feed' }
function fixture() {
  let state = createStudyState()
  let since: number | undefined
  const samples: number[] = []
  const step = (event: StudyEvent, now: number) => {
    const previous = state
    state = reduce(state, event, now).state
    const learned = observeGraceReturn(since, previous, state, now)
    since = learned.since
    if (learned.durationMs !== undefined) samples.push(learned.durationMs)
    return state
  }
  step({ type: 'START_SETUP', task: 'Essay', minutes: 30 }, 0)
  step({ type: 'LOCK_WINDOW', window: task }, 0)
  const off = (now = 1_000) => step({ type: 'WINDOW_OBSERVED', window: other, verdict: 'off', matchesTask: false }, now)
  const back = (now = 31_000) => step({ type: 'WINDOW_OBSERVED', window: task, verdict: 'on', matchesTask: true }, now)
  return { step, off, back, samples }
}

describe('learning from actual task returns', () => {
  it('learns once from an unprompted return and ignores brief switches', () => {
    const f = fixture()
    f.off(); f.back(); f.back(32_000)
    f.off(40_000); f.back(42_000)
    expect(f.samples).toEqual([30_000])
  })
  it('does not learn from related research, unknown windows, pauses, or End', () => {
    const f = fixture()
    f.off()
    f.step({ type: 'WINDOW_OBSERVED', window: other, verdict: 'on', matchesTask: false }, 31_000)
    f.off(40_000); f.step({ type: 'WINDOW_UNAVAILABLE' }, 41_000); f.back(70_000)
    f.off(80_000); f.step({ type: 'PAUSE' }, 81_000); f.step({ type: 'RESUME' }, 90_000); f.back(110_000)
    f.off(120_000); f.step({ type: 'END' }, 121_000); f.back(150_000)
    expect(f.samples).toEqual([])
  })
  it('does not learn from a nudge, allowance, snooze, or failed guided return', () => {
    for (const action of ['allow', 'snooze', 'return'] as const) {
      const f = fixture()
      f.off()
      f.step({ type: 'TICK' }, 91_000)
      f.step({ type: 'NUDGE_SENT' }, 91_000)
      if (action === 'allow') f.step({ type: 'ALLOW_CURRENT' }, 92_000)
      if (action === 'snooze') f.step({ type: 'SNOOZE', minutes: 1 }, 92_000)
      if (action === 'return') {
        f.step({ type: 'RETURN_REQUEST', mode: 'guided' }, 92_000)
        f.step({ type: 'TICK' }, 152_000)
      }
      f.back(180_000)
      expect(f.samples).toEqual([])
    }
  })
  it('uses the learned value for actual grace expiry while leaving the session config fixed', () => {
    const config = { ...DEFAULTS, graceMs: adaptiveGraceMs(Array(5).fill(30_000)) }
    let state = createStudyState(config)
    state = reduce(state, { type: 'START_SETUP', task: 'Essay', minutes: 30 }, 0).state
    state = reduce(state, { type: 'LOCK_WINDOW', window: task }, 0).state
    state = reduce(state, { type: 'WINDOW_OBSERVED', window: other, verdict: 'off', matchesTask: false }, 1_000).state
    expect(reduce(state, { type: 'TICK' }, 45_999).state.phase).toBe('DRIFTING')
    expect(reduce(state, { type: 'TICK' }, 46_000).state.phase).toBe('NUDGING')
    expect(state.config.graceMs).toBe(45_000)
  })
})
