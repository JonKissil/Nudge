import type { OverlayState, WindowInfo } from '../../shared/types'
import { focusTaskWindow } from '../os/focus'
import { readTabStrip } from '../ocr/ocr'
import { findTaskTab } from '../ocr/tabStrip'

export type Guidance = Pick<OverlayState, 'arrow' | 'guidance'>

export interface ReturnPorts {
  requestFullFrame(): Promise<{ pngBase64: string }>
  showGuidance(view: Guidance): void
  log(message: string): void
}

export class ReturnActions {
  private version = 0
  constructor(private readonly ports: ReturnPorts) {}

  cancel(): void { this.version++; this.ports.showGuidance({}) }

  async focus(window: WindowInfo): Promise<boolean> {
    this.cancel()
    const result = await focusTaskWindow(window)
    if (result !== 'ok') this.ports.log('Could not switch to the task. Check browser Automation access; offering guidance.')
    return result === 'ok'
  }

  async guide(window: WindowInfo): Promise<boolean> {
    const version = ++this.version
    this.ports.showGuidance({})
    let view: Guidance = { guidance: { text: `Click: ${window.title}` } }
    try {
      const frame = await this.ports.requestFullFrame()
      const arrow = findTaskTab(await readTabStrip(frame.pngBase64), window.title)
      if (arrow) view = { arrow }
    } catch { this.ports.log('The task tab is not visible or OCR is unavailable; showing the task title.') }
    if (version !== this.version) return false
    this.ports.showGuidance(view)
    return true
  }
}
