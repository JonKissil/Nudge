import type { NormalizedBox, WindowBounds, WindowInfo } from '../../shared/types'
import { isBrowser } from '../drift/matchWindow'

export function displayRegion(bounds: WindowBounds, display: WindowBounds): NormalizedBox | undefined {
  const left = Math.max(bounds.x, display.x), top = Math.max(bounds.y, display.y)
  const right = Math.min(bounds.x + bounds.width, display.x + display.width)
  const bottom = Math.min(bounds.y + bounds.height, display.y + display.height)
  if (right <= left || bottom <= top) return undefined
  return { x: (left - display.x) / display.width, y: (top - display.y) / display.height,
    w: (right - left) / display.width, h: (bottom - top) / display.height }
}

export function documentRegion(window: WindowInfo, display: WindowBounds): NormalizedBox | undefined {
  const header = isBrowser(window) ? 96 : 28
  return displayRegion({ ...window.bounds, y: window.bounds.y + header,
    height: Math.max(0, window.bounds.height - header - 24) }, display)
}

export function mapCropBoxes<T extends NormalizedBox>(boxes: readonly T[], region: NormalizedBox): T[] {
  return boxes.map((box) => ({ ...box, x: region.x + box.x * region.w, y: region.y + box.y * region.h,
    w: box.w * region.w, h: box.h * region.h }))
}

/** Exclusion still works when macOS includes protected overlay windows in the capture. */
export function overlayExclusions(display: WindowBounds, caption: string): NormalizedBox[] {
  const regions: NormalizedBox[] = []
  const pill = displayRegion({ x: display.x + display.width - 324, y: display.y + 32,
    width: 308, height: 88 }, display)
  if (pill) regions.push(pill)
  if (caption.trim()) {
    const width = Math.min(720, display.width - 48)
    const height = 36 + 28 * Math.ceil(caption.length / Math.max(1, Math.floor((width - 44) / 10)))
    const captions = displayRegion({ x: display.x + (display.width - width) / 2 - 4,
      y: display.y + display.height - 44 - height, width: width + 8, height: height + 8 }, display)
    if (captions) regions.push(captions)
  }
  return regions
}
