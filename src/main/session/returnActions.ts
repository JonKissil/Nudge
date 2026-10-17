import type { OverlayState, WindowInfo } from '../../shared/types'
import { focusTaskWindow } from '../os/focus'
import { findTaskTab, TAB_STRIP_HEIGHT, type OcrBox } from '../ocr/tabStrip'

export type Guidance = Pick<OverlayState, 'arrow' | 'guidance'>

export interface ReturnPorts {
  requestFullFrame(): Promise<{ pngBase64: string }>
  showGuidance(view: Guidance): void
  log(message: string): void
  readTabStrip(png: string, signal: AbortSignal): Promise<OcrBox[]>
}

export class ReturnActions {
  private version = 0
  private abort?: AbortController
  constructor(private readonly ports: ReturnPorts) {}

  dispose(): void { this.version++; this.abort?.abort(); this.abort = undefined }
  cancel(): void { this.dispose(); this.ports.showGuidance({}) }

  async focus(window: WindowInfo): Promise<boolean> {
    this.cancel()
    const result = await focusTaskWindow(window)
    if (result !== 'ok') this.ports.log('Could not switch to the task. Check browser Automation access; offering guidance.')
    return result === 'ok'
  }

  async guide(window: WindowInfo): Promise<boolean> {
    this.abort?.abort()
    const abort = this.abort = new AbortController()
    const version = ++this.version
    this.ports.showGuidance({})
    let view: Guidance = { guidance: { text: `Click: ${window.title}` } }
    try {
      const frame = await this.ports.requestFullFrame()
      if (version !== this.version) return false
      // The service returns full-display coordinates; the title matcher accepts strip coordinates.
      const boxes = (await this.ports.readTabStrip(frame.pngBase64, abort.signal))
        .map((box) => ({ ...box, y: box.y / TAB_STRIP_HEIGHT, h: box.h / TAB_STRIP_HEIGHT }))
      const arrow = findTaskTab(boxes, window.title)
      if (arrow) view = { arrow }
    } catch { if (version === this.version) this.ports.log('The task tab is not visible or OCR is unavailable; showing the task title.') }
    if (version !== this.version) return false
    this.ports.showGuidance(view)
    return true
  }
}
