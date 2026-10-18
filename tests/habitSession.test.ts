import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as waitForIo } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppWindows } from '../src/main/windows'
import type { SessionSnapshot } from '../src/shared/types'
import type { FakeLiveClient } from './fakes/FakeLiveClient'
import { IPC } from '../src/shared/ipc'
import { defaultPrivacySettings } from '../src/shared/privacy'

const runtime = vi.hoisted(() => ({
  path: '', handlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  client: undefined as FakeLiveClient | undefined,
}))
vi.mock('electron', () => ({
  app: { getPath: () => runtime.path, once: () => {}, isPackaged: false },
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => runtime.handlers.set(channel, handler), on: () => {} },
  screen: { getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1200, height: 800 } }) },
  systemPreferences: {},
}))
vi.mock('../src/main/gemini/liveClient', async () => {
  const { FakeLiveClient } = await import('./fakes/FakeLiveClient')
  return { GeminiLiveClient: class extends FakeLiveClient { constructor() { super(); runtime.client = this } } }
})
vi.mock('../src/main/session/perception', () => ({ PerceptionController: class {
  constructor(private readonly ports: { observeWindow: (window: typeof task, verdict: 'on', matches: boolean) => Promise<unknown> }) {}
  setCaptureRunning() {} cancelLock() {} dispose() {} invalidatePrivacy() {}
  async refreshWindow() { await this.ports.observeWindow(task, 'on', true) }
} }))
vi.mock('../src/main/session/taskRecovery', () => ({ TaskRecovery: class { start() {} stop() {} dispose() {} } }))
vi.mock('../src/main/session/returnActions', () => ({ ReturnActions: class { cancel() {} dispose() {} } }))
vi.mock('../src/main/session/documentReentry', () => ({ DocumentReentry: class { reset() {} finish() {} } }))
vi.mock('../src/main/ocr/ocr', () => ({ OcrService: class { dispose() {} } }))

import { registerScaffoldIpc, type SessionHooks } from '../src/main/session/session'

const task = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Fixture', id: 123, url: 'https://example.test/task',
  bounds: { x: 0, y: 0, width: 1200, height: 800 } }
let hooks: SessionHooks | undefined
let directory = ''
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nudge-habit-session-'))
  runtime.path = directory
  runtime.handlers.clear()
  runtime.client = undefined
  vi.stubEnv('DEMO_MODE', '0')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.useFakeTimers({ now: 1_000_000, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})
afterEach(async () => {
  await hooks?.endSession()
  hooks?.dispose(); hooks = undefined
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
function fixture() {
  const sender = { send: vi.fn(), mainFrame: {} }
  const windows = { control: { webContents: sender }, media: { webContents: { send: vi.fn() } },
    overlay: { webContents: { send: vi.fn() }, setIgnoreMouseEvents: vi.fn() } } as unknown as AppWindows
  hooks = registerScaffoldIpc(() => windows)
  let snapshot: SessionSnapshot
  hooks.onSnapshot((value) => { snapshot = value })
  const invoke = async (channel: string, payload: unknown = {}) => runtime.handlers.get(channel)!({ sender, senderFrame: sender.mainFrame }, payload)
  const begin = async () => {
    await invoke(IPC.settingsSet, { privacy: { ...defaultPrivacySettings(), shareBrowserContent: true } })
    expect(await invoke(IPC.sessionStart, { task: 'Synthetic fixture', minutes: 5 })).toEqual({ ok: true })
    expect(await hooks!.activateTaskWindow(task)).toEqual({ ok: true })
    await hooks!.observeWindow(task, 'on', true)
  }
  return { invoke, begin, snapshot: () => snapshot! }
}
async function settle(check: () => boolean) {
  for (let i = 0; i < 1000; i++) {
    if (check()) return
    await waitForIo(1)
  }
  throw new Error('Tool response did not complete.')
}

describe('habit learning in the main session wiring', () => {
  it('holds on excluded/unknown sources, stops learning and tools, and resumes only approved content', async () => {
    const f = fixture()
    await f.begin()
    await f.invoke(IPC.settingsSet, { privacy: { ...defaultPrivacySettings(), shareBrowserContent: true,
      excludedDomains: ['private.test'] } })
    const turns = runtime.client!.turns.length
    await hooks!.observeWindow({ ...task, title: 'PRIVATE_TITLE', url: 'https://private.test/PRIVATE_PATH?token=SECRET' }, 'off', false)
    expect(f.snapshot().privacy).toMatchObject({ sharing: false, reason: 'excluded-site' })
    expect(f.snapshot().state).toBe('FOCUSED')
    expect(hooks!.togglePushToTalk()).toMatchObject({ ok: false })
    await vi.advanceTimersByTimeAsync(200_000)
    expect(runtime.client!.turns.length).toBe(turns)
    expect(f.snapshot().stats.habitEvents).toBe(0)
    await hooks!.observeWindow(task, 'on', true)
    expect(f.snapshot().privacy?.sharing).toBe(true)
    await f.invoke(IPC.sessionPauseToggle)
    await hooks!.observeWindow(task, 'on', true)
    expect(f.snapshot().state).toBe('PAUSED')
    expect(f.snapshot().privacy?.sharing).toBe(false)
    await f.invoke(IPC.sessionEnd)
  })
  it('automatically reviews on the task, saves next-session timing, and keeps the active timer fixed', async () => {
    const events = Array.from({ length: 5 }, (_, i) => i === 4
      ? { id: randomUUID(), kind: 'feedback-more-time', graceMs: 90_000 }
      : { id: randomUUID(), kind: 'spontaneous-return', durationMs: 60_000, graceMs: 90_000 })
    await writeFile(join(directory, 'state.json'), JSON.stringify({ version: 1, allowList: [],
      graceHistory: Array(5).fill(60_000), habits: { revision: 5, events } }))
    const f = fixture()
    expect(runtime.client!.turns).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(31_000)
    expect(runtime.client!.turns).toHaveLength(0) // Warmup never reviews.
    await f.begin()
    expect(f.snapshot().stats.graceMs).toBe(75_000)
    await vi.advanceTimersByTimeAsync(30_000)
    const review = runtime.client!.turns.find((turn) => turn.tag === 'HABIT_REVIEW')!
    expect(review).toBeDefined()
    runtime.client!.emit({ type: 'tool-call', call: { id: 'review', name: 'propose_grace_period', args: {
      review_id: review.reviewId, grace_ms: 90_000, evidence_ids: events.map((event) => event.id), reason: 'requested-more-time',
    } } })
    await settle(() => runtime.client!.toolResponses.at(-1)?.id === 'review')
    expect(runtime.client!.toolResponses.at(-1)?.response).toMatchObject({ ok: true })
    expect(f.snapshot().stats.graceMs).toBe(75_000)
    expect(f.snapshot().stats.nextGraceMs).toBe(90_000)
    await f.invoke(IPC.settingsSet, { geminiGrace: false })
    expect(f.snapshot().stats.graceMs).toBe(75_000)
    await f.invoke(IPC.settingsSet, { geminiGrace: true })
    await f.invoke(IPC.sessionEnd)
    await f.begin()
    expect(f.snapshot().stats.graceMs).toBe(90_000)
    await f.invoke(IPC.graceReset)
    expect(f.snapshot().stats.habitProfile).toBeUndefined()
    expect(f.snapshot().stats.habitEvents).toBe(0)
  })

  it('records Settings and gated spoken feedback and blocks repeats, pause, demo, and opt-out', async () => {
    const f = fixture()
    expect(await f.invoke(IPC.graceFeedback, { preference: 'more-time' })).toMatchObject({ ok: false })
    await f.begin()
    expect(await f.invoke(IPC.graceFeedback, { preference: 'sooner' })).toEqual({ ok: true })
    expect(hooks!.togglePushToTalk()).toEqual({ ok: true })
    runtime.client!.emit({ type: 'user-transcription', text: 'Please give me longer before future check-ins.' })
    runtime.client!.emit({ type: 'tool-call', call: { id: 'spoken', name: 'record_timing_feedback', args: { preference: 'more-time' } } })
    await settle(() => runtime.client!.toolResponses.at(-1)?.id === 'spoken')
    expect(runtime.client!.toolResponses.at(-1)?.response).toEqual({ ok: true })
    runtime.client!.emit({ type: 'tool-call', call: { id: 'repeat', name: 'record_timing_feedback', args: { preference: 'more-time' } } })
    await settle(() => runtime.client!.toolResponses.at(-1)?.id === 'repeat')
    expect(runtime.client!.toolResponses.at(-1)?.response).toMatchObject({ ok: false })
    const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')) as { habits: { events: { kind: string }[] } }
    expect(state.habits.events.map((event) => event.kind)).toEqual(['feedback-sooner', 'feedback-more-time'])
    await f.invoke(IPC.sessionPauseToggle)
    expect(await f.invoke(IPC.graceFeedback, { preference: 'more-time' })).toMatchObject({ ok: false })
    await f.invoke(IPC.sessionPauseToggle)
    await f.invoke(IPC.settingsSet, { demoMode: true })
    expect(await f.invoke(IPC.graceFeedback, { preference: 'more-time' })).toMatchObject({ ok: false })
    await f.invoke(IPC.settingsSet, { demoMode: false, geminiGrace: false })
    expect(await f.invoke(IPC.graceFeedback, { preference: 'more-time' })).toMatchObject({ ok: false })
    await f.invoke(IPC.sessionEnd)
  })
})
