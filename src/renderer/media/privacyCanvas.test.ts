import { describe, expect, it } from 'vitest'
import { paintPrivateFrame } from './privacyCanvas'

describe('privacy frame composition', () => {
  it('paints black padding and masks after the window source with display-normalized coordinates', () => {
    const commands: unknown[][] = []
    const ctx = { fillStyle: '', fillRect: (...args: number[]) => commands.push(['fill', ...args]),
      drawImage: (...args: unknown[]) => commands.push(['draw', ...args]) }
    const canvas = { width: 1, height: 1, getContext: () => ctx } as unknown as OffscreenCanvas
    const video = {} as HTMLVideoElement
    paintPrivateFrame(canvas, video, { revision: 2, windowId: 42,
      window: { x: 100, y: 100, width: 800, height: 500 },
      display: { x: 0, y: 0, width: 1200, height: 800 }, scaleFactor: 2,
      masks: [{ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }] }, 1200)
    expect(commands).toEqual([['fill', 0, 0, 1200, 800], ['draw', video, 100, 100, 800, 500], ['fill', 240, 160, 121, 81]])
  })
})
