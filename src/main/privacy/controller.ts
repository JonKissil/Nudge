import { defaultPrivacySettings, type CapturePolicy, type PrivacySettings, type PrivacyState } from '../../shared/privacy'
import type { WindowBounds, WindowInfo } from '../../shared/types'
import { isBrowser } from '../drift/matchWindow'
import { sharingDecision } from './policy'

export function privacyWindowKey(window: WindowInfo | undefined): string { return JSON.stringify(window ?? null) }

/** All sensitive window details remain local. Revisions invalidate asynchronous work and buffers. */
export class PrivacyController {
  settings = defaultPrivacySettings()
  state: PrivacyState = { revision: 0, sharing: false, reason: 'unknown' }
  window?: WindowInfo
  private key = ''

  constructor(private readonly ports: {
    task(): WindowInfo | undefined
    changed(state: PrivacyState): void
    ownProcessId?: number
  }) {}

  configure(settings: PrivacySettings): void {
    this.settings = settings
    this.key = ''
    this.observe(this.window)
  }

  observe(window: WindowInfo | undefined): void {
    const task = this.ports.task()
    const taskReason = task && sharingDecision(task, task, this.settings, this.ports.ownProcessId)
    // Excluding the task also withholds its saved context, even on an approved research window.
    const reason = taskReason && taskReason !== 'sharing' ? taskReason
      : sharingDecision(window, task, this.settings, this.ports.ownProcessId)
    const key = `${privacyWindowKey(window)}|${reason}`
    if (key === this.key) return
    this.key = key
    this.window = window
    this.state = { revision: this.state.revision + 1, sharing: reason === 'sharing', reason }
    this.ports.changed(this.state)
  }

  suspend(): void {
    this.key = ''
    this.window = undefined
    this.state = { revision: this.state.revision + 1, sharing: false, reason: 'paused' }
    this.ports.changed(this.state)
  }

  current(revision: number): boolean { return this.state.sharing && this.state.revision === revision }

  capturePolicy(display: WindowBounds, scaleFactor: number): CapturePolicy | undefined {
    const window = this.window
    if (!this.state.sharing || !window?.id) return
    // Mask title/address bars in both JPEG and local OCR captures.
    const left = Math.max(display.x, window.bounds.x), top = Math.max(display.y, window.bounds.y)
    const right = Math.min(display.x + display.width, window.bounds.x + window.bounds.width)
    const bottom = Math.min(display.y + display.height, window.bounds.y + (isBrowser(window) ? window.bounds.height * 0.14 : 32))
    const bar = right > left && bottom > top ? [{ x: (left - display.x) / display.width,
      y: (top - display.y) / display.height, w: (right - left) / display.width, h: (bottom - top) / display.height }] : []
    return { revision: this.state.revision, windowId: window.id, window: window.bounds, display, scaleFactor,
      masks: [...this.settings.masks, ...bar] }
  }
}
