import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { observeHabitEpisode, type HabitEpisode } from '../src/main/session/habitEvents'
import { createStudyState, reduce, type StudyEvent } from '../src/main/session/stateMachine'
import type { HabitEvent } from '../src/shared/habits'

const task = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay',
  url: 'https://example.test/essay', bounds: { x: 0, y: 0, width: 1200, height: 800 } }
const other = { ...task, url: 'https://example.test/feed' }
function fixture() {
  let state = createStudyState()
  let episode: HabitEpisode | undefined
  const events: HabitEvent[] = []
  const step = (action: StudyEvent, now: number) => {
    const previous = state
    state = reduce(state, action, now).state
    const result = observeHabitEpisode(episode, previous, state, action, now, randomUUID())
    episode = result.episode
    if (result.event) events.push(result.event)
  }
  step({ type: 'START_SETUP', task: 'Essay', minutes: 30 }, 0)
  step({ type: 'LOCK_WINDOW', window: task }, 0)
  const off = () => step({ type: 'WINDOW_OBSERVED', window: other, verdict: 'off', matchesTask: false }, 1_000)
  const back = (now: number) => step({ type: 'WINDOW_OBSERVED', window: task, verdict: 'on', matchesTask: true }, now)
  const nudge = () => { step({ type: 'TICK' }, 91_000); step({ type: 'NUDGE_SENT' }, 91_000) }
  return { step, off, back, nudge, events }
}
describe('habit episode observation', () => {
  it('records spontaneous returns and distinguishes independent/assisted returns after a nudge', () => {
    const spontaneous = fixture()
    spontaneous.off(); spontaneous.back(31_000); spontaneous.back(32_000)
    expect(spontaneous.events).toMatchObject([{ kind: 'spontaneous-return', durationMs: 30_000 }])
    for (const assisted of [false, true]) {
      const f = fixture()
      f.off(); f.nudge()
      if (assisted) f.step({ type: 'RETURN_REQUEST', mode: 'focused' }, 100_000)
      f.back(111_000)
      expect(f.events).toMatchObject([{ kind: 'nudge', durationMs: 90_000 },
        { kind: assisted ? 'assisted-return' : 'independent-return', durationMs: 110_000, nudgedAfterMs: 90_000 }])
      expect(f.events[0]?.id).toBe(f.events[1]?.id)
    }
  })
  it('ignores interrupted/brief/research episodes and automatic snoozes', () => {
    for (const action of [{ type: 'PAUSE' }, { type: 'END' }, { type: 'WINDOW_UNAVAILABLE' }] as const) {
      const f = fixture()
      f.off(); f.step(action, 10_000); f.back(31_000)
      expect(f.events).toEqual([])
    }
    const brief = fixture(); brief.off(); brief.back(2_000)
    expect(brief.events).toEqual([])
    const research = fixture(); research.off()
    research.step({ type: 'WINDOW_OBSERVED', window: other, verdict: 'on', matchesTask: false }, 31_000)
    expect(research.events).toEqual([])
    const auto = fixture(); auto.off(); auto.nudge(); auto.step({ type: 'TICK' }, 112_000)
    expect(auto.events.map((event) => event.kind)).toEqual(['nudge'])
    const explicit = fixture(); explicit.off(); explicit.nudge(); explicit.step({ type: 'SNOOZE', minutes: 5 }, 100_000)
    expect(explicit.events.at(-1)).toMatchObject({ kind: 'snooze', minutes: 5 })
  })
})
