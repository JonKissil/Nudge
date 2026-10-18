import type { AppWindows } from '../windows'
import { classifyWindow } from '../drift/rules'
import { isBrowser, matchWindow } from '../drift/matchWindow'
import { readActiveWindow, startActiveWindowPoller } from '../os/activeWindow'
import { NativeReadQueue } from '../os/windowReadQueue'
import { readTaskTabUrl } from '../os/focus'
import { registerScreenCapture } from '../os/screenCapture'
import { DEFAULTS, LOCK_WINDOW_COUNTDOWN_MS } from '../../shared/config'
import { IPC } from '../../shared/ipc'
import type { IpcPayload } from '../../shared/ipc'
import type { ActionResult, AllowListEntry, CaptureStatus, SessionSnapshot, SessionState, WindowInfo } from '../../shared/types'

type FullFrame = IpcPayload<typeof IPC.frameFull>

export interface PerceptionPorts {
  getWindows(): AppWindows | undefined
  getSnapshot(): SessionSnapshot
  updateSnapshot(update: (snapshot: SessionSnapshot) => SessionSnapshot): void
  getPhase(): SessionState
  getAllowList(): readonly AllowListEntry[]
  activateTaskWindow(window: WindowInfo): Promise<ActionResult>
  observeWindow(window: WindowInfo, verdict: 'on' | 'off' | 'ask' | 'ignore', matchesTask: boolean): Promise<ActionResult>
  onWindowUnavailable(): void
  pause(): Promise<ActionResult>
  publish(): void
  log(message: string): void
}

export class PerceptionController {
  private captureDesired = false
  private disposed = false
  private lockTimer?: ReturnType<typeof setTimeout>
  private lockVersion = 0
  private lastFrameAt = -Infinity
  private frameTimes: number[] = []
  private fullRequest?: { resolve(frame: FullFrame): void; reject(error: Error): void;
    timer: ReturnType<typeof setTimeout> }
  private readonly stopPoller: () => void
  private readonly stopCaptureHandler: () => void
  private readonly metricsTimer: ReturnType<typeof setInterval>
  private readonly nativeReads = new NativeReadQueue()
  private readonly fullFrames = new NativeReadQueue()
  private readonly readWindow = (): Promise<WindowInfo | undefined> => this.nativeReads.run(readActiveWindow)

  constructor(private readonly ports: PerceptionPorts) {
    const media = ports.getWindows()?.media
    if (!media) throw new Error('Media window is not ready')
    this.stopCaptureHandler = registerScreenCapture(media, () => this.captureAllowed(), (message) => ports.log(message))
    this.stopPoller = startActiveWindowPoller((window) => { void this.observe(window) },
      (message) => ports.log(message), this.readWindow, () => ports.getPhase() === 'RETURNING' ? 500 : 1000)
    this.metricsTimer = setInterval(() => {
      this.frameTimes = this.frameTimes.filter((time) => time > Date.now() - 60_000)
      ports.updateSnapshot((snapshot) => ({ ...snapshot, stats: { ...snapshot.stats,
        framesPerMinute: this.frameTimes.length } }))
      ports.publish()
    }, 1000)
    this.metricsTimer.unref()
  }

  private async observe(window: WindowInfo | undefined): Promise<void> {
    if (this.disposed) return
    const locked = this.ports.getSnapshot().taskWindow
    const verdict = window ? classifyWindow(window, locked, this.ports.getAllowList(), { ownProcessId: process.pid }) : undefined
    this.ports.updateSnapshot((snapshot) => ({ ...snapshot, stats: {
      ...snapshot.stats, currentWindow: window, ruleVerdict: verdict,
    } }))
    this.ports.publish()
    if (!window) this.ports.onWindowUnavailable()
    if (window && locked && verdict) {
      const result = await this.ports.observeWindow(window, verdict, matchWindow(window, locked))
      if (!result.ok) this.ports.log(result.error)
    }
  }

  captureAllowed(): boolean {
    return !this.disposed && this.captureDesired
      && !['IDLE', 'SETUP', 'PAUSED', 'ENDED'].includes(this.ports.getPhase())
  }

  readCurrentWindow(): Promise<WindowInfo | undefined> { return this.readWindow() }

  readTaskUrl(window: WindowInfo): Promise<string | undefined> {
    return this.nativeReads.run(() => !this.disposed
      && ['FOCUSED', 'DRIFTING', 'SNOOZED', 'REENTRY'].includes(this.ports.getPhase())
      ? readTaskTabUrl(window) : Promise.resolve(undefined))
  }

  async refreshWindow(window?: WindowInfo): Promise<void> { await this.observe(window ?? await this.readWindow()) }

  setCaptureRunning(running: boolean): void {
    this.captureDesired = running
    this.lastFrameAt = -Infinity
    if (!running) this.rejectFullFrame('Capture stopped')
    this.sendCaptureState()
  }

  sendCaptureState(): void {
    const media = this.ports.getWindows()?.media
    if (media && !media.isDestroyed()) media.webContents.send(IPC.captureSet, { running: this.captureAllowed() })
  }

  lockWindow(): ActionResult {
    if (this.ports.getPhase() !== 'SETUP') return { ok: false, error: 'Save a task before locking its window.' }
    if (this.ports.getSnapshot().lockWindowAt) return { ok: false, error: 'The window countdown is already running.' }
    const version = ++this.lockVersion
    this.ports.updateSnapshot((snapshot) => ({ ...snapshot,
      lockWindowAt: Date.now() + LOCK_WINDOW_COUNTDOWN_MS, lockError: undefined }))
    this.ports.publish()
    this.lockTimer = setTimeout(() => { void this.finishLock(version) }, LOCK_WINDOW_COUNTDOWN_MS)
    return { ok: true }
  }

  private async finishLock(version: number): Promise<void> {
    try {
      const window = await this.readWindow()
      if (this.disposed || version !== this.lockVersion) return
      if (!window || window.ownerPid === process.pid) {
        throw new Error('Switch to your task window during the countdown, then try again.')
      }
      if (!window.title.trim()) throw new Error('Window titles are unavailable. Enable Screen Recording, then restart Nudge.')
      if (isBrowser(window) && !window.url) {
        throw new Error('The browser URL is unavailable. Check Accessibility and Automation permissions, then restart Nudge.')
      }
      const result = await this.ports.activateTaskWindow(window)
      if (!result.ok) throw new Error(result.error)
      this.frameTimes = []
      this.lastFrameAt = -Infinity
      this.ports.log('Task window locked; screen capture and Live session starting.')
      await this.observe(window)
    } catch (error) {
      if (!this.disposed && version === this.lockVersion) {
        const message = error instanceof Error ? error.message : 'The task window could not be locked.'
        this.ports.updateSnapshot((snapshot) => ({ ...snapshot, lockError: message }))
        this.ports.log(message)
      }
    } finally {
      if (!this.disposed && version === this.lockVersion) {
        this.ports.updateSnapshot((snapshot) => ({ ...snapshot, lockWindowAt: undefined }))
        this.ports.publish()
      }
    }
  }

  cancelLock(): void {
    clearTimeout(this.lockTimer)
    this.lockVersion += 1
    this.ports.updateSnapshot((snapshot) => ({ ...snapshot, lockWindowAt: undefined }))
  }

  acceptFrame(): boolean {
    if (!this.captureAllowed()) return false
    const now = performance.now()
    if (now - this.lastFrameAt < 1000 / DEFAULTS.frameMaxFps) return false
    this.lastFrameAt = now
    this.frameTimes.push(Date.now())
    this.ports.updateSnapshot((snapshot) => ({ ...snapshot, stats: {
      ...snapshot.stats, framesPerMinute: this.frameTimes.length,
    } }))
    return true
  }

  handleCaptureStatus(status: CaptureStatus): void {
    this.ports.updateSnapshot((snapshot) => ({ ...snapshot, stats: { ...snapshot.stats, capture: status } }))
    if (status.error) this.ports.log(status.error)
    if (status.state === 'running' && status.error) this.rejectFullFrame(status.error)
    if (['off', 'error'].includes(status.state) && this.captureAllowed()) {
      this.captureDesired = false
      this.rejectFullFrame('Capture stopped')
      void this.ports.pause()
    }
    this.ports.publish()
  }

  handleFullFrame(frame: FullFrame): void {
    if (!this.fullRequest || !this.captureAllowed()) return
    clearTimeout(this.fullRequest.timer)
    this.fullRequest.resolve(frame)
    this.fullRequest = undefined
  }

  requestFullFrame(): Promise<FullFrame> {
    return this.fullFrames.run(() => new Promise<FullFrame>((resolve, reject) => {
      if (!this.captureAllowed() || this.ports.getSnapshot().stats.capture?.state !== 'running') {
        reject(new Error('Capture is not running'))
        return
      }
      if (this.fullRequest) { reject(new Error('A full-resolution frame is already pending')); return }
      this.fullRequest = { resolve, reject,
        timer: setTimeout(() => this.rejectFullFrame('Full-resolution frame timed out'), 5000) }
      this.ports.getWindows()?.media.webContents.send(IPC.frameRequestFull, {})
    }))
  }

  private rejectFullFrame(message: string): void {
    if (!this.fullRequest) return
    clearTimeout(this.fullRequest.timer)
    this.fullRequest.reject(new Error(message))
    this.fullRequest = undefined
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancelLock()
    this.captureDesired = false
    this.sendCaptureState()
    this.stopPoller()
    this.stopCaptureHandler()
    clearInterval(this.metricsTimer)
    this.rejectFullFrame('App closed')
  }
}
