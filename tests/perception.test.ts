import { describe, expect, it, vi } from 'vitest'
import { PerceptionController } from '../src/main/session/perception'
import type { PerceptionPorts } from '../src/main/session/perception'
import type { AppWindows } from '../src/main/windows'
import { SessionSnapshotSchema } from '../src/shared/types'
import { IPC } from '../src/shared/ipc'
import { PrivacyController } from '../src/main/privacy/controller'

vi.mock('../src/main/os/screenCapture', () => ({ registerScreenCapture: () => () => {} }))
vi.mock('../src/main/os/activeWindow', () => ({
  readActiveWindow: async () => undefined, startActiveWindowPoller: () => () => {},
}))

describe('full-resolution capture requests', () => {
  it('ignores an old off acknowledgement after a newer capture command starts', () => {
    const task = { app: 'TextEdit', bundleId: 'com.apple.TextEdit', id: 42, title: 'Fixture',
      bounds: { x: 0, y: 0, width: 1200, height: 800 } }
    const privacy = new PrivacyController({ task: () => task, changed: () => {} })
    privacy.observe(task)
    let snapshot = SessionSnapshotSchema.parse({ state: 'FOCUSED', conn: 'connected', task: 'Essay', minutes: 5,
      language: 'en', settings: { demoMode: false, showHud: false },
      stats: { capture: { state: 'off' }, framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [] } })
    const send = vi.fn()
    const pause = vi.fn(async () => ({ ok: true as const }))
    const capture = new PerceptionController({
      getWindows: () => ({ media: { isDestroyed: () => false, webContents: { send } } } as unknown as AppWindows),
      getSnapshot: () => snapshot, getPhase: () => snapshot.state, updateSnapshot: (update) => { snapshot = update(snapshot) },
      getAllowList: () => [], activateTaskWindow: async () => ({ ok: true }), observeWindow: async () => ({ ok: true }),
      onWindowUnavailable: () => {}, pause, publish: () => {}, log: () => {},
      privacy: { controller: () => privacy, capturePolicy: () => privacy.capturePolicy(task.bounds, 1) },
    })
    try {
      capture.sendCaptureState()
      const old = send.mock.calls.at(-1)![1] as { revision: number; commandId: number }
      capture.setCaptureRunning(true)
      const current = send.mock.calls.at(-1)![1] as typeof old
      capture.handleCaptureStatus({ state: 'off', ...old })
      expect(pause).not.toHaveBeenCalled()
      expect(capture.captureAllowed()).toBe(true)
      capture.handleCaptureStatus({ state: 'running', ...current })
      expect(snapshot.stats.capture?.state).toBe('running')
      capture.handleCaptureStatus({ state: 'off', ...current })
      expect(pause).toHaveBeenCalledOnce()
      expect(capture.captureAllowed()).toBe(false)
    } finally { capture.dispose() }
  })
  it('rejects a failed frame immediately without stopping streaming and accepts the next request', async () => {
    let snapshot = SessionSnapshotSchema.parse({
      state: 'FOCUSED', conn: 'connected', task: 'Essay', minutes: 30, language: 'en',
      settings: { demoMode: false, showHud: false },
      stats: { capture: { state: 'running' }, framesPerMinute: 0,
        resumptionHandleAgeMs: null, transitions: [], logs: [] },
    })
    const send = vi.fn()
    const ports: PerceptionPorts = {
      getWindows: () => ({ media: { isDestroyed: () => false, webContents: { send } } } as unknown as AppWindows),
      getSnapshot: () => snapshot, getPhase: () => snapshot.state,
      updateSnapshot: (update) => { snapshot = update(snapshot) }, getAllowList: () => [],
      activateTaskWindow: async () => ({ ok: true }), observeWindow: async () => ({ ok: true }),
      onWindowUnavailable: () => {}, pause: vi.fn(async () => ({ ok: true as const })),
      publish: () => {}, log: () => {},
    }
    const capture = new PerceptionController(ports)
    try {
      capture.setCaptureRunning(true)
      const failed = capture.requestFullFrame()
      const rejection = expect(failed).rejects.toThrow('Frame delivery failed')
      await Promise.resolve()
      expect(send).toHaveBeenCalledWith(IPC.frameRequestFull, {})
      capture.handleCaptureStatus({ state: 'running', error: 'Frame delivery failed' })
      await rejection
      expect(capture.captureAllowed()).toBe(true)
      expect(ports.pause).not.toHaveBeenCalled()
      const retry = capture.requestFullFrame()
      await Promise.resolve()
      await capture.handleFullFrame({ pngBase64: 'AAAA', width: 3840, height: 2160, revision: 0 })
      capture.handleCaptureStatus({ state: 'running' })
      await expect(retry).resolves.toEqual({ pngBase64: 'AAAA', width: 3840, height: 2160, revision: 0 })
      expect(snapshot.stats.capture).toEqual({ state: 'running' })
    } finally { capture.dispose() }
  })
})
