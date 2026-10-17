import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { z } from 'zod'
import { DEFAULTS, DEMO_TASK } from '../../shared/config'
import { EmptySchema, IPC, IpcSchemas, type IpcChannel, type IpcPayload } from '../../shared/ipc'
import { ActionResultSchema, OverlayStateSchema, SessionSnapshotSchema } from '../../shared/types'
import type { ActionResult, SessionSnapshot, SessionState, WindowInfo } from '../../shared/types'
import type { AppWindows } from '../windows'
import { classifyWindow } from '../drift/rules'
import { isBrowser } from '../drift/matchWindow'
import { readActiveWindow, startActiveWindowPoller } from '../os/activeWindow'
import { registerScreenCapture } from '../os/screenCapture'

export interface SessionController {
  requestFullFrame: () => Promise<IpcPayload<typeof IPC.frameFull>>
  dispose: () => void
}

// M2 perception wiring; the study reducer and Live connection arrive in M3/M4.
export function registerScaffoldIpc(getWindows: () => AppWindows): SessionController {
  const demoMode = process.env.DEMO_MODE === '1'
  let snapshot: SessionSnapshot = SessionSnapshotSchema.parse({
    state: 'IDLE', conn: 'disconnected', task: demoMode ? DEMO_TASK : '', minutes: 30,
    settings: { demoMode, showHud: demoMode },
    stats: { framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [], capture: { state: 'off' } },
  })
  let lockTimer: ReturnType<typeof setTimeout> | undefined
  let lockVersion = 0, disposed = false, lastFrameAt = -Infinity
  let frameTimes: number[] = []
  let fullRequest: { resolve: (frame: IpcPayload<typeof IPC.frameFull>) => void; reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout> } | undefined
  const isSender = (sender: WebContents, kind: keyof AppWindows): boolean => getWindows()[kind].webContents === sender
  const captureAllowed = (): boolean => !disposed && snapshot.state === 'FOCUSED'
  const sendCapture = (): void => {
    const media = getWindows().media
    if (!media.isDestroyed()) media.webContents.send(IPC.captureSet, IpcSchemas[IPC.captureSet].parse({ running: captureAllowed() }))
  }
  const publish = (): void => {
    if (disposed) return
    const windows = getWindows()
    if (!windows.control.isDestroyed()) windows.control.webContents.send(IPC.sessionSnapshot, SessionSnapshotSchema.parse(snapshot))
    if (!windows.overlay.isDestroyed()) windows.overlay.webContents.send(IPC.overlayState, OverlayStateSchema.parse({
      pill: { state: snapshot.state, offline: false }, notes: [],
    }))
  }
  const log = (message: string): void => {
    snapshot = { ...snapshot, stats: { ...snapshot.stats, logs: [...snapshot.stats.logs, message].slice(-50) } }
    console.info(message)
  }
  const transition = (state: SessionState): void => {
    if (state === snapshot.state) return
    const from = snapshot.state
    snapshot = { ...snapshot, state, stats: { ...snapshot.stats,
      transitions: [...snapshot.stats.transitions, { from, to: state, at: Date.now() }].slice(-10) } }
    log(`Session: ${from} → ${state}`)
  }
  const verdict = (currentWindow: WindowInfo | undefined): void => {
    snapshot = { ...snapshot, stats: { ...snapshot.stats, currentWindow,
      ruleVerdict: currentWindow ? classifyWindow(currentWindow, snapshot.taskWindow, [], { ownProcessId: process.pid }) : undefined } }
  }
  const cancelLock = (): void => {
    clearTimeout(lockTimer)
    lockVersion++
    snapshot = { ...snapshot, lockWindowAt: undefined }
  }
  const rejectFullFrame = (message: string): void => {
    if (!fullRequest) return
    clearTimeout(fullRequest.timer)
    fullRequest.reject(new Error(message))
    fullRequest = undefined
  }
  const handle = <T>(channel: IpcChannel, schema: z.ZodType<T>, action: (payload: T) => ActionResult): void => {
    ipcMain.handle(channel, (event, payload: unknown) => {
      if (!isSender(event.sender, 'control') || event.senderFrame !== event.sender.mainFrame) return { ok: false, error: 'This command is only available in the control window.' }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return { ok: false, error: 'Invalid command payload.' }
      try { const result = ActionResultSchema.parse(action(parsed.data)); publish(); return result }
      catch { log(`Command failed: ${channel}`); return { ok: false, error: 'The command could not be completed.' } }
    })
  }
  ipcMain.handle(IPC.sessionSnapshot, (event, payload: unknown) => {
    if (!isSender(event.sender, 'control') || event.senderFrame !== event.sender.mainFrame
      || !EmptySchema.safeParse(payload).success) throw new Error('Invalid snapshot request')
    return SessionSnapshotSchema.parse(snapshot)
  })
  handle(IPC.sessionStart, IpcSchemas[IPC.sessionStart], (input) => {
    if (!['IDLE', 'ENDED', 'SETUP'].includes(snapshot.state)) return { ok: false, error: 'End the current session before starting another.' }
    cancelLock()
    snapshot = { ...snapshot, ...input, taskWindow: undefined, lockError: undefined }
    transition('SETUP')
    return { ok: true }
  })
  handle(IPC.sessionEnd, EmptySchema, () => {
    cancelLock(); transition('ENDED'); rejectFullFrame('Session ended'); sendCapture()
    return { ok: true }
  })
  handle(IPC.sessionLockWindow, EmptySchema, () => {
    if (snapshot.state !== 'SETUP') return { ok: false, error: 'Save your task before locking a window.' }
    if (snapshot.lockWindowAt) return { ok: false, error: 'The window countdown is already running.' }
    const version = ++lockVersion
    snapshot = { ...snapshot, lockWindowAt: Date.now() + 3000, lockError: undefined }
    lockTimer = setTimeout(() => {
      void (async () => {
        try {
          const window = await readActiveWindow()
          if (disposed || version !== lockVersion) return
          if (!window || window.ownerPid === process.pid) throw new Error('Switch to your task window during the countdown, then try again.')
          if (!window.title.trim()) throw new Error('Window titles are unavailable. Enable Screen Recording for Electron and restart it.')
          if (isBrowser(window) && !window.url) throw new Error('The browser URL is unavailable. Check Accessibility and Automation → your browser for Electron, then restart.')
          snapshot = { ...snapshot, taskWindow: window }
          verdict(window); transition('FOCUSED'); lastFrameAt = -Infinity; frameTimes = []
          log('Task window locked. Screen capture starting; AI connection is scheduled for M3.')
          sendCapture()
        } catch (error: unknown) {
          if (!disposed && version === lockVersion) {
            const message = error instanceof Error ? error.message : 'The task window could not be locked.'
            snapshot = { ...snapshot, lockError: message }; log(message)
          }
        } finally {
          if (!disposed && version === lockVersion) { snapshot = { ...snapshot, lockWindowAt: undefined }; publish() }
        }
      })()
    }, 3000)
    return { ok: true }
  })
  handle(IPC.captureSet, IpcSchemas[IPC.captureSet], ({ running }) => {
    if (!snapshot.taskWindow || !['FOCUSED', 'PAUSED'].includes(snapshot.state)) return { ok: false, error: 'Lock your task window first.' }
    transition(running ? 'FOCUSED' : 'PAUSED')
    if (!running) rejectFullFrame('Capture paused')
    lastFrameAt = -Infinity
    sendCapture()
    return { ok: true }
  })
  handle(IPC.settingsSet, IpcSchemas[IPC.settingsSet], (settings) => {
    snapshot = { ...snapshot, settings: { ...snapshot.settings, ...settings } }
    return { ok: true }
  })
  const stopCaptureHandler = registerScreenCapture(getWindows().media, captureAllowed, (message) => { log(message); publish() })
  const stopPoller = startActiveWindowPoller((window) => { verdict(window); publish() }, (message) => { log(message); publish() })
  const channels = [IPC.frame, IPC.frameFull, IPC.micChunk, IPC.overlayAction, IPC.overlayHover, IPC.mediaReady, IPC.captureStatus] as const
  for (const channel of channels) {
    ipcMain.on(channel, (event, payload: unknown) => {
      const kind = channel.startsWith('overlay:') ? 'overlay' : 'media'
      if (!isSender(event.sender, kind) || event.senderFrame !== event.sender.mainFrame || disposed) return
      const parsed = IpcSchemas[channel].safeParse(payload)
      if (!parsed.success) { log(`Invalid IPC payload: ${channel}`); return }
      if (channel === IPC.mediaReady) sendCapture()
      if (channel === IPC.captureStatus) {
        const status = IpcSchemas[IPC.captureStatus].parse(parsed.data)
        snapshot = { ...snapshot, stats: { ...snapshot.stats, capture: status } }
        if (status.error) log(status.error)
        if (['off', 'error'].includes(status.state) && captureAllowed()) transition('PAUSED')
        publish()
      }
      if (channel === IPC.frame && captureAllowed()) {
        const now = performance.now()
        if (now - lastFrameAt >= 1000 / DEFAULTS.frameMaxFps) { lastFrameAt = now; frameTimes.push(Date.now()) }
        // M3 will forward validated frames to LiveClient here. Never retain or log pixels.
      }
      if (channel === IPC.frameFull && fullRequest && captureAllowed()) {
        clearTimeout(fullRequest.timer)
        fullRequest.resolve(IpcSchemas[IPC.frameFull].parse(parsed.data)); fullRequest = undefined
      }
      if (channel === IPC.overlayHover) getWindows().overlay.setIgnoreMouseEvents(!IpcSchemas[IPC.overlayHover].parse(parsed.data).interactive, { forward: true })
    })
  }
  const metricsTimer = setInterval(() => {
    frameTimes = frameTimes.filter((time) => time > Date.now() - 60_000)
    snapshot = { ...snapshot, stats: { ...snapshot.stats, framesPerMinute: frameTimes.length } }
    publish()
  }, 1000)
  return {
    requestFullFrame: () => new Promise((resolve, reject) => {
      if (!captureAllowed() || snapshot.stats.capture?.state !== 'running') { reject(new Error('Capture is not running')); return }
      if (fullRequest) { reject(new Error('A full-resolution frame is already pending')); return }
      fullRequest = { resolve, reject, timer: setTimeout(() => rejectFullFrame('Full-resolution frame timed out'), 5000) }
      getWindows().media.webContents.send(IPC.frameRequestFull, {})
    }),
    dispose: () => {
      if (disposed) return
      disposed = true
      cancelLock(); clearInterval(metricsTimer); stopPoller(); stopCaptureHandler(); rejectFullFrame('App closed')
      sendCapture()
      for (const channel of channels) ipcMain.removeAllListeners(channel)
      for (const channel of [IPC.sessionSnapshot, IPC.sessionStart, IPC.sessionEnd, IPC.sessionLockWindow, IPC.captureSet, IPC.settingsSet]) ipcMain.removeHandler(channel)
    },
  }
}
