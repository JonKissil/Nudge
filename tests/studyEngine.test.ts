import { describe, expect, it, vi } from 'vitest'
import type { WindowInfo } from '../src/shared/types'
import { createStudyToolHandlers, StudyEngine } from '../src/main/session/engine'
import type { EffectPorts } from '../src/main/session/effects'
import { LiveSessionBridge } from '../src/main/session/liveSession'
import { FakeLiveClient } from './fakes/FakeLiveClient'

const doc: WindowInfo = {
  app: 'Google Chrome', bundleId: 'com.google.Chrome', title: 'Essay - Google Docs',
  url: 'https://docs.google.com/document/d/abc/edit',
  bounds: { x: 0, y: 0, width: 1280, height: 800 },
}
const video: WindowInfo = { ...doc, title: 'Music - YouTube', url: 'https://youtube.com/watch?v=123' }
const config = {
  graceMs: 15_000, offTaskConfidence: 0.6, checkinSilenceMs: 12_000,
  silentSnoozeMs: 120_000, returnTimeoutMs: 60_000, maxNudgesPer10Min: 3,
}

function fixture(focusSucceeds = true, guideSucceeds = true) {
  let now = 0
  const client = new FakeLiveClient()
  const capture = vi.fn()
  const nudge = vi.fn()
  const focus = vi.fn(async () => focusSucceeds)
  const guide = vi.fn(async () => guideSucceeds)
  const note = vi.fn(async () => {})
  const allow = vi.fn(async (window: WindowInfo) => { void window })
  const ocr = vi.fn(async () => ['L1: The Estates-General met in 1789'])
  const ports: EffectPorts = {
    startLive: (context) => bridge.start(context), stopLive: () => bridge.stop(),
    sendTurn: (turn) => bridge.sendTurn(turn),
    setMicOpen: (open) => bridge.setMicOpen(open),
    setCheckinActive: (active) => bridge.setCheckinActive(active),
    setCaptureRunning: capture, showNudge: nudge,
    focusTask: focus, guideTask: guide,
    ocrLines: ocr,
    pinNote: note, allowWindow: allow,
  }
  const engine = new StudyEngine(config, ports, undefined, () => now)
  const bridge = new LiveSessionBridge(client, createStudyToolHandlers(engine), {
    playAudio: () => {}, flushAudio: () => {}, resetAudio: () => {},
    caption: () => {}, userSpeech: () => {}, micSet: () => {},
    connection: () => {}, resumptionHandle: () => {}, error: () => {},
  })
  return { client, engine, bridge, capture, nudge, focus, guide, note, allow, ocr, setNow: (value: number) => { now = value } }
}

async function reachCheckin(f: ReturnType<typeof fixture>): Promise<void> {
  await f.engine.dispatch({ type: 'START_SETUP', task: 'History essay', minutes: 30 }, 0)
  await f.engine.dispatch({ type: 'LOCK_WINDOW', window: doc }, 0)
  await f.engine.dispatch({ type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 1)
  f.setNow(1)
  f.client.emit({ type: 'tool-call', call: { id: 'status', name: 'report_status', args: {
    on_task: false, activity: 'Watching music video', confidence: 0.95,
  } } })
  await vi.waitFor(() => expect(f.engine.state.phase).toBe('DRIFTING'))
  await f.engine.dispatch({ type: 'TICK' }, 15_001)
  expect(f.engine.state.phase).toBe('CHECKIN')
}

describe('study engine and Live tool loop', () => {
  it('ignores OCR from an ended session even if another session is already in re-entry', async () => {
    const f = fixture()
    await reachCheckin(f)
    await f.engine.dispatch({ type: 'ARRIVED' }, 16_000)
    let finish!: (lines: string[]) => void
    f.ocr.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = f.engine.dispatch({ type: 'TICK' }, 16_800)
    await vi.waitFor(() => expect(f.ocr).toHaveBeenCalledOnce())
    await f.engine.dispatch({ type: 'END' }, 17_000)
    await reachCheckin(f)
    await f.engine.dispatch({ type: 'ARRIVED' }, 16_000)
    const before = f.client.turns.filter((turn) => turn.tag === 'USER_RETURNED').length
    finish(['L1: Stale document from previous session'])
    await pending
    expect(f.client.turns.filter((turn) => turn.tag === 'USER_RETURNED')).toHaveLength(before)
    expect(f.engine.state.reentrySent).toBe(false)
    await f.engine.dispatch({ type: 'TICK' }, 16_800)
    expect(f.client.turns.at(-1)?.text).toContain('The Estates-General met in 1789')
    await f.engine.dispatch({ type: 'END' })
    f.bridge.dispose()
  })

  it('does not roll a paused session back into re-entry when a pending pin fails', async () => {
    const f = fixture()
    await reachCheckin(f)
    await f.engine.dispatch({ type: 'ARRIVED' }, 16_000)
    let fail!: (error: Error) => void
    f.note.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
    const pin = f.engine.dispatch({ type: 'PIN_STEP', text: 'What could you explore next?', lineId: 'L1' }, 17_000)
    await vi.waitFor(() => expect(f.note).toHaveBeenCalledOnce())
    await f.engine.dispatch({ type: 'PAUSE' }, 17_001)
    fail(new Error('Return cancelled'))
    expect((await pin).ok).toBe(false)
    expect(f.engine.state.phase).toBe('PAUSED')
    await f.engine.dispatch({ type: 'END' })
    f.bridge.dispose()
  })
  it('allows the latest check-in window, ignoring our own controls', async () => {
    const f = fixture()
    await reachCheckin(f)
    const lecture = { ...video, url: 'https://youtube.com/watch?v=lecture' }
    await f.engine.dispatch({ type: 'WINDOW_OBSERVED', window: lecture, verdict: 'ask', matchesTask: false })
    await f.engine.dispatch({ type: 'WINDOW_OBSERVED', window: { ...doc, app: 'Nudge' }, verdict: 'ignore', matchesTask: false })
    f.client.emit({ type: 'tool-call', call: { id: 'allow', name: 'allow_current_window', args: { reason: 'Essay research' } } })
    await vi.waitFor(() => expect(f.client.toolResponses).toHaveLength(2))
    expect(f.allow).toHaveBeenCalledExactlyOnceWith(lecture)
    expect(f.engine.state.phase).toBe('FOCUSED')
    expect(f.client.checkinActive).toBe(false)
    await f.engine.dispatch({ type: 'END' })
    f.bridge.dispose()
  })

  it('keeps a failed save in check-in and does not undo End after an in-flight save', async () => {
    const f = fixture()
    await reachCheckin(f)
    f.allow.mockRejectedValueOnce(new Error('Disk full'))
    expect(await f.engine.dispatch({ type: 'ALLOW_CURRENT' })).toEqual({ ok: false, error: 'Disk full' })
    expect(f.engine.state.phase).toBe('CHECKIN')
    let finish!: () => void
    f.allow.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const pending = f.engine.dispatch({ type: 'ALLOW_CURRENT' })
    await f.engine.dispatch({ type: 'END' })
    finish()
    await pending
    expect(f.engine.state.phase).toBe('ENDED')
    f.bridge.dispose()
  })

  it('lets the guided fallback button focus once, then waits for a real arrival', async () => {
    const f = fixture()
    await reachCheckin(f)
    await f.engine.dispatch({ type: 'RETURN_REQUEST', mode: 'guided' })
    expect(f.guide).toHaveBeenCalledOnce()
    const tools = createStudyToolHandlers(f.engine)
    expect(await tools.focusTaskWindow()).toEqual({ ok: true })
    expect((await tools.focusTaskWindow()).ok).toBe(false)
    expect(f.focus).toHaveBeenCalledOnce()
    expect(f.engine.state.phase).toBe('RETURNING')
    await f.engine.dispatch({ type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false })
    expect(f.engine.state.phase).toBe('RETURNING')
    await f.engine.dispatch({ type: 'WINDOW_OBSERVED', window: doc, verdict: 'on', matchesTask: true })
    expect(f.engine.state.phase).toBe('REENTRY')
    await f.engine.dispatch({ type: 'END' })
    f.bridge.dispose()
  })
  it('rejects an invalid status and accepts the next scheduled screen check', async () => {
    const f = fixture()
    await f.engine.dispatch({ type: 'START_SETUP', task: 'History essay', minutes: 30 }, 0)
    await f.engine.dispatch({ type: 'LOCK_WINDOW', window: doc }, 0)
    await f.engine.dispatch({ type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 1)
    f.client.emit({ type: 'tool-call', call: { id: 'invalid', name: 'report_status', args: {
      on_task: true, activity: 'one two three four five six seven eight nine', confidence: 0.9,
    } } })
    await vi.waitFor(() => expect(f.client.toolResponses).toHaveLength(1))
    expect(f.client.toolResponses[0]).toMatchObject({ id: 'invalid', scheduling: 'silent', response: { ok: false } })
    expect(f.engine.state.checkPending).toBe(false)
    expect(f.engine.state.phase).toBe('FOCUSED')

    await f.engine.dispatch({ type: 'WINDOW_OBSERVED', window: video, verdict: 'ask', matchesTask: false }, 10_000)
    expect(f.client.turns.filter((turn) => turn.tag === 'CHECK')).toHaveLength(2)
    f.client.emit({ type: 'tool-call', call: { id: 'valid', name: 'report_status', args: {
      on_task: true, activity: 'Reading history sources', confidence: 0.9,
    } } })
    await vi.waitFor(() => expect(f.client.toolResponses).toHaveLength(2))
    expect(f.client.toolResponses[1]).toMatchObject({ id: 'valid', scheduling: 'silent', response: { ok: true } })
    expect(f.engine.state.lastStatus?.activity).toBe('Reading history sources')
    await f.engine.dispatch({ type: 'END' }, 20_000)
    f.bridge.dispose()
  })

  it('checks drift, nudges, focuses, reads lines, and pins one next step', async () => {
    const f = fixture()
    await reachCheckin(f)
    expect(f.client.connections).toHaveLength(1)
    expect(f.client.turns.map((turn) => turn.tag)).toEqual(['SESSION_START', 'CHECK', 'NUDGE'])
    expect(f.capture).toHaveBeenCalledWith(true)
    expect(f.nudge).toHaveBeenCalledWith(true)
    expect(f.client.checkinActive).toBe(true)

    f.client.emit({ type: 'tool-call', call: { id: 'focus', name: 'focus_task_window', args: {} } })
    await vi.waitFor(() => expect(f.client.toolResponses).toHaveLength(2))
    expect(f.client.toolResponses[1]).toMatchObject({ id: 'focus', response: { ok: true } })
    expect(f.focus).toHaveBeenCalledWith(doc)
    expect(f.engine.state.phase).toBe('RETURNING')

    await f.engine.dispatch({ type: 'WINDOW_OBSERVED', window: doc, verdict: 'on', matchesTask: true }, 16_000)
    await f.engine.dispatch({ type: 'TICK' }, 16_800)
    expect(f.client.turns.at(-1)).toMatchObject({ tag: 'USER_RETURNED' })
    expect(f.client.turns.at(-1)?.text).toContain('L1: The Estates-General met in 1789')

    f.client.emit({ type: 'tool-call', call: { id: 'pin', name: 'pin_next_step', args: {
      text: 'What is one reason they met?', line_id: 'L1',
    } } })
    await vi.waitFor(() => expect(f.client.toolResponses).toHaveLength(3))
    expect(f.client.toolResponses[2]).toMatchObject({ id: 'pin', response: { ok: true } })
    expect(f.note).toHaveBeenCalledWith('What is one reason they met?', 'L1')
    expect(f.engine.state.phase).toBe('FOCUSED')
    await f.engine.dispatch({ type: 'END' }, 20_000)
    expect(f.client.disconnects).toBe(1)
    f.bridge.dispose()
  })

  it('reports focus failure truthfully and offers guided return', async () => {
    const f = fixture(false)
    await reachCheckin(f)
    f.client.emit({ type: 'tool-call', call: { id: 'focus', name: 'focus_task_window', args: {} } })
    await vi.waitFor(() => expect(f.client.toolResponses).toHaveLength(2))
    expect(f.client.toolResponses[1]).toMatchObject({ id: 'focus', response: { ok: false } })
    expect(f.guide).toHaveBeenCalledWith(doc)
    expect(f.engine.state.returnMode).toBe('guided')
    await f.engine.dispatch({ type: 'END' }, 20_000)
    f.bridge.dispose()
  })

  it('keeps the check-in open when both return paths fail', async () => {
    const f = fixture(false, false)
    await reachCheckin(f)
    f.client.emit({ type: 'tool-call', call: { id: 'focus', name: 'focus_task_window', args: {} } })
    await vi.waitFor(() => expect(f.client.toolResponses).toHaveLength(2))
    expect(f.client.toolResponses[1]?.response.ok).toBe(false)
    expect(f.engine.state.phase).toBe('CHECKIN')
    await f.engine.dispatch({ type: 'END' }, 20_000)
    f.bridge.dispose()
  })
})
