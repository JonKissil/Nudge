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
  const ports: EffectPorts = {
    startLive: (context) => bridge.start(context), stopLive: () => bridge.stop(),
    sendTurn: (turn) => bridge.sendTurn(turn),
    setMicOpen: (open) => bridge.setMicOpen(open),
    setCheckinActive: (active) => bridge.setCheckinActive(active),
    setCaptureRunning: capture, showNudge: nudge,
    focusTask: focus, guideTask: guide,
    ocrLines: async () => ['L1: The Estates-General met in 1789'],
    pinNote: note, allowWindow: async () => {},
  }
  const engine = new StudyEngine(config, ports, undefined, () => now)
  const bridge = new LiveSessionBridge(client, createStudyToolHandlers(engine), {
    playAudio: () => {}, flushAudio: () => {}, caption: () => {}, micSet: () => {},
    connection: () => {}, resumptionHandle: () => {}, error: () => {},
  })
  return { client, engine, bridge, capture, nudge, focus, guide, note, setNow: (value: number) => { now = value } }
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
