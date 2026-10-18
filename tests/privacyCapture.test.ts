import { describe, expect, it, vi } from 'vitest'
import { registerScreenCapture } from '../src/main/os/screenCapture'
import type { BrowserWindow } from 'electron'
import type { CapturePolicy } from '../src/shared/privacy'

const native = vi.hoisted(() => ({ getSources: vi.fn(), handler: undefined as undefined | ((request: unknown, callback: (result: unknown) => void) => void) }))
vi.mock('electron', () => ({ desktopCapturer: { getSources: native.getSources }, session: { defaultSession: {
  setDisplayMediaRequestHandler: (handler: typeof native.handler) => { native.handler = handler },
} } }))

describe('approved window capture sources', () => {
  it('selects the exact native window and rejects source races without selecting any screen', async () => {
    let policy: CapturePolicy | undefined = { revision: 1, windowId: 42,
      window: { x: 0, y: 0, width: 1200, height: 800 }, display: { x: 0, y: 0, width: 1200, height: 800 }, scaleFactor: 2, masks: [] }
    const mainFrame = {}
    const media = { isDestroyed: () => false, webContents: { mainFrame } } as unknown as BrowserWindow
    const stop = registerScreenCapture(media, () => Boolean(policy), vi.fn(), () => policy)
    try {
      const other = { id: 'window:420:0', name: 'PRIVATE_OTHER' }
      const approved = { id: 'window:42:0', name: 'Approved' }
      native.getSources.mockResolvedValue([other, approved, { id: 'screen:0:0', name: 'PRIVATE_DISPLAY' }])
      const callback = vi.fn()
      native.handler!({ frame: mainFrame, videoRequested: true, audioRequested: false }, callback)
      await Promise.resolve()
      expect(native.getSources).toHaveBeenLastCalledWith({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
      expect(callback).toHaveBeenCalledWith({ video: approved })
      const delayed = vi.fn()
      native.handler!({ frame: mainFrame, videoRequested: true, audioRequested: false }, delayed)
      policy = undefined
      await Promise.resolve()
      expect(delayed).toHaveBeenCalledWith({})
      const blocked = vi.fn()
      native.handler!({ frame: mainFrame, videoRequested: true, audioRequested: false }, blocked)
      expect(blocked).toHaveBeenCalledWith({})
    } finally { stop() }
  })
})
