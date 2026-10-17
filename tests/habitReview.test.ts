import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HabitReviewer } from '../src/main/session/habitReview'
import { AppStore } from '../src/main/store'
import { selectHabitGraceMs, type HabitProposal } from '../src/shared/habits'
import type { LiveTurn } from '../src/main/gemini/types'
import { LiveSessionBridge } from '../src/main/session/liveSession'
import { FakeLiveClient } from './fakes/FakeLiveClient'
import { createStudyState, reduce } from '../src/main/session/stateMachine'
import { DEFAULTS } from '../src/shared/config'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'nudge-habits-'))
  directories.push(directory)
  const path = join(directory, 'state.json')
  const store = new AppStore(path, vi.fn())
  await Promise.all(Array.from({ length: 5 }, () => store.recordHabitEvent({
    id: randomUUID(), kind: 'spontaneous-return', graceMs: 90_000, durationMs: 60_000,
  })))
  const turns: LiveTurn[] = []
  let now = 0
  let eligible = true
  let busy = false
  const saved = vi.fn()
  const reviewer = new HabitReviewer({ store, eligible: () => eligible,
    trySend: (turn) => { if (busy) return false; turns.push(turn); return true }, saved,
  }, () => now)
  reviewer.startSession()
  const propose = (): HabitProposal => ({ review_id: turns.at(-1)!.reviewId!, grace_ms: 75_000,
    evidence_ids: store.habits.events.map((event) => event.id), reason: 'return-pattern' })
  return { path, store, reviewer, turns, saved, propose,
    time: (value: number) => { now = value }, eligible: (value: boolean) => { eligible = value },
    busy: (value: boolean) => { busy = value } }
}

describe('persistent Gemini habit reviews', () => {
  it('routes a real tool boundary through the bridge and changes only the next session timer', async () => {
    const f = await fixture()
    const client = new FakeLiveClient()
    let now = 0
    const reviewer: HabitReviewer = new HabitReviewer({ store: f.store, eligible: () => true,
      trySend: (turn) => bridge.trySendHabitReview(turn), saved: () => {},
    }, () => now)
    const deny = async () => ({ ok: false })
    const bridge = new LiveSessionBridge(client, { reportStatus: deny, focusTaskWindow: deny, guideToTask: deny,
      pinNextStep: deny, snooze: deny, allowCurrentWindow: deny, endCheckin: deny, setTask: deny,
      proposeGracePeriod: (proposal) => reviewer.propose(proposal),
    }, { playAudio: () => {}, flushAudio: () => {}, resetAudio: () => {}, caption: () => {}, userSpeech: () => {},
      micSet: () => {}, connection: () => {}, resumptionHandle: () => {}, error: () => {} })
    const task = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Fixture', url: 'https://example.test/task',
      bounds: { x: 0, y: 0, width: 1000, height: 700 } }
    try {
      await bridge.start({ task: 'Synthetic test', minutes: 5, language: 'en', taskWindow: task, state: 'FOCUSED' })
      reviewer.startSession(); now = 30_000; reviewer.consider(90_000)
      expect(client.turns).toHaveLength(1)
      client.emit({ type: 'tool-call', call: { id: 'review-call', name: 'propose_grace_period', args: {
        review_id: client.turns[0]!.reviewId, grace_ms: 75_000,
        evidence_ids: f.store.habits.events.map((event) => event.id), reason: 'return-pattern',
      } } })
      await vi.waitFor(() => expect(client.toolResponses[0]).toMatchObject({ id: 'review-call', scheduling: 'silent', response: { ok: true } }))
      const active = { ...DEFAULTS }
      expect(active.graceMs).toBe(90_000)
      const next = { ...DEFAULTS, graceMs: selectHabitGraceMs([], true, false, true, f.store.habits.profile) }
      let state = createStudyState(next)
      state = reduce(state, { type: 'START_SETUP', task: 'Synthetic test', minutes: 5 }, 0).state
      state = reduce(state, { type: 'LOCK_WINDOW', window: task }, 0).state
      state = reduce(state, { type: 'WINDOW_OBSERVED', window: { ...task, url: 'https://example.test/feed' },
        verdict: 'off', matchesTask: false }, 1_000).state
      expect(reduce(state, { type: 'TICK' }, 75_999).state.phase).toBe('DRIFTING')
      expect(reduce(state, { type: 'TICK' }, 76_000).state.phase).toBe('NUDGING')
    } finally { await bridge.stop(); bridge.dispose() }
  })
  it('reviews only when idle after startup, persists accepted timing for the next session, and limits reviews', async () => {
    const f = await fixture()
    f.reviewer.consider(90_000)
    expect(f.turns).toEqual([])
    f.time(30_000); f.busy(true); f.reviewer.consider(90_000)
    expect(f.turns).toEqual([])
    f.busy(false); f.reviewer.consider(90_000)
    expect(f.turns).toHaveLength(1)
    expect(await f.reviewer.propose(f.propose())).toEqual({ ok: true, applies: 'next-session' })
    expect(f.saved).toHaveBeenCalledOnce()
    const restarted = new AppStore(f.path, vi.fn())
    expect(restarted.habits.profile?.graceMs).toBe(75_000)
    expect(selectHabitGraceMs([], true, false, true, restarted.habits.profile)).toBe(75_000)
    f.reviewer.consider(90_000)
    expect(f.turns).toHaveLength(1)
    f.reviewer.startSession(); f.time(60_000); f.reviewer.consider(75_000)
    expect(f.turns).toHaveLength(1) // An old profile alone is never new evidence.
  })
  it('rejects old IDs, duplicates, changed history, timeout, and cancellation', async () => {
    for (const invalidate of ['id', 'duplicate', 'history', 'timeout', 'cancel'] as const) {
      const f = await fixture()
      f.time(30_000); f.reviewer.consider(90_000)
      const proposal = f.propose()
      if (invalidate === 'id') proposal.review_id = randomUUID()
      if (invalidate === 'duplicate') proposal.evidence_ids = Array(5).fill(proposal.evidence_ids[0])
      if (invalidate === 'history') await f.store.recordHabitEvent({ id: randomUUID(), kind: 'feedback-more-time', graceMs: 90_000 })
      if (invalidate === 'timeout') f.time(40_001)
      if (invalidate === 'cancel') { f.eligible(false); f.reviewer.cancel() }
      expect(await f.reviewer.propose(proposal)).toMatchObject({ ok: false })
      expect(f.store.habits.profile).toBeUndefined()
    }
  })
  it('cannot restore learned data after reset or opt-out, including serialized write races', async () => {
    for (const disable of ['reset', 'adaptive', 'gemini'] as const) {
      const f = await fixture()
      f.time(30_000); f.reviewer.consider(90_000)
      const proposal = f.propose()
      const change = disable === 'reset' ? f.store.resetGraceHistory()
        : disable === 'adaptive' ? f.store.setAdaptiveGrace(false) : f.store.setGeminiGrace(false)
      const response = f.reviewer.propose(proposal)
      await change
      expect(await response).toMatchObject({ ok: false })
      expect(new AppStore(f.path, vi.fn()).habits.profile).toBeUndefined()
    }
  })
  it('bounds concurrent events, preserves old data, and independently discards corrupt habit memory', async () => {
    const f = await fixture()
    await Promise.all(Array.from({ length: 65 }, () => f.store.recordHabitEvent({
      id: randomUUID(), kind: 'feedback-sooner', graceMs: 90_000,
    })))
    expect(new AppStore(f.path, vi.fn()).habits.events).toHaveLength(60)
    const saved = JSON.parse(await readFile(f.path, 'utf8')) as Record<string, unknown>
    await writeFile(f.path, JSON.stringify({ ...saved, allowList: [{ kind: 'bundle', value: 'com.apple.TextEdit' }],
      habits: { revision: -1, events: ['invalid'] } }))
    const recovered = new AppStore(f.path, vi.fn())
    expect(recovered.allowList).toHaveLength(1)
    expect(recovered.habits.events).toEqual([])
    expect(recovered.geminiGrace).toBe(true)
    await recovered.setGeminiGrace(false)
    await recovered.recordHabitEvent({ id: randomUUID(), kind: 'feedback-more-time', graceMs: 90_000 })
    expect(new AppStore(f.path, vi.fn()).habits.events).toEqual([])
  })
})
