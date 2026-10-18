import { describe, expect, it, vi } from 'vitest'
import { PerceptionController } from '../src/main/session/perception'
import type { PerceptionPorts } from '../src/main/session/perception'
import type { AppWindows } from '../src/main/windows'
import { SessionSnapshotSchema } from '../src/shared/types'
import { IPC } from '../src/shared/ipc'

vi.mock('../src/main/os/screenCapture', () => ({ registerScreenCapture: () => () => {} }))
vi.mock('../src/main/os/activeWindow', () => ({
  readActiveWindow: async () => undefined, startActiveWindowPoller: () => () => {},
}))

describe('full-resolution capture requests', () => {
  it('rejects a failed frame immediately without stopping streaming and accepts the next request', async () => {
    let snapshot = SessionSnapshotSchema.parse({
      state: 'FOCUSED', conn: 'connected', task: 'Essay', minutes: 30, language: 'en',
      settings: { demoMode: false, showHud: false, quietMode: false },
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
      capture.handleFullFrame({ pngBase64: 'AAAA', width: 3840, height: 2160 })
      capture.handleCaptureStatus({ state: 'running' })
      await expect(retry).resolves.toEqual({ pngBase64: 'AAAA', width: 3840, height: 2160 })
      expect(snapshot.stats.capture).toEqual({ state: 'running' })
    } finally { capture.dispose() }
  })
})
