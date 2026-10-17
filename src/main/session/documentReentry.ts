import type { NormalizedBox, SessionState, WindowBounds, WindowInfo } from '../../shared/types'
import { matchWindow } from '../drift/matchWindow'
import { documentRegion } from '../ocr/geometry'
import { boxesToLines, formatDocLines, type DocumentLine } from '../ocr/lines'
import type { OcrBox } from '../ocr/tabStrip'

export interface DocumentReentryPorts {
  getPhase(): SessionState
  getTask(): WindowInfo | undefined
  getDisplay(): WindowBounds
  getExclusions(): NormalizedBox[]
  readWindow(): Promise<WindowInfo | undefined>
  requestFrame(): Promise<{ pngBase64: string }>
  recognize(png: string, region: NormalizedBox, signal: AbortSignal): Promise<OcrBox[]>
  log(message: string): void
}

export class DocumentReentry {
  private version = 0
  private abort?: AbortController
  private lines: DocumentLine[] = []
  private window?: WindowInfo

  constructor(private readonly ports: DocumentReentryPorts) {}

  get generation(): number { return this.version }
  get taskWindow(): WindowInfo | undefined { return this.window }

  finish(): void { this.version++; this.abort?.abort(); this.abort = undefined }
  reset(): void { this.finish(); this.lines = []; this.window = undefined }

  async readLines(): Promise<string[]> {
    this.finish()
    this.lines = []
    const version = this.version, task = this.ports.getTask()
    const abort = this.abort = new AbortController()
    const valid = (): boolean => version === this.version && this.ports.getPhase() === 'REENTRY'
    try {
      if (!valid() || !task) return []
      // Capture and the foreground read are independent. Avoid adding native read latency
      // to the wait for a fresh video frame, then verify the window again before sending text.
      const [window, frame] = await Promise.all([this.ports.readWindow(), this.ports.requestFrame()])
      if (!valid() || !window || !matchWindow(window, task)) return []
      this.window = window
      const display = this.ports.getDisplay(), region = documentRegion(window, display)
      if (!region) return []
      const excluded = this.ports.getExclusions()
      const [current, boxes] = await Promise.all([this.ports.readWindow(),
        this.ports.recognize(frame.pngBase64, region, abort.signal)])
      if (!valid() || !current || !matchWindow(current, task)
        || JSON.stringify(current.bounds) !== JSON.stringify(window.bounds)) return []
      this.lines = boxesToLines(boxes, region, excluded)
      return formatDocLines(this.lines)
    } catch {
      if (valid()) this.ports.log('Document OCR unavailable; the next step will use the task window margin.')
      return []
    } finally { if (version === this.version) this.abort = undefined }
  }

  async locateLine(id: string): Promise<NormalizedBox | undefined> {
    const line = this.lines.find((candidate) => candidate.id === id)
    if (!line || !this.window) return undefined
    const version = this.version, window = this.window
    const current = await this.ports.readWindow()
    if (version !== this.version) return undefined
    if (!current || !matchWindow(current, window)) return undefined
    if (JSON.stringify(current.bounds) !== JSON.stringify(window.bounds)) {
      this.window = current
      this.lines = []
      return undefined
    }
    return line.box
  }
}
