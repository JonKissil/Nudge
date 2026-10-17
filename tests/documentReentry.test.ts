import { describe, expect, it, vi } from 'vitest'
import { DocumentReentry } from '../src/main/session/documentReentry'
import type { SessionState, WindowInfo } from '../src/shared/types'
import type { OcrBox } from '../src/main/ocr/tabStrip'

const task: WindowInfo = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay',
  url: 'https://example.com/essay', bounds: { x: 0, y: 25, width: 1408, height: 856 } }
const box: OcrBox = { text: 'The financial crisis increased pressure for reform.', x: 0.2, y: 0.5, w: 0.4, h: 0.03 }
function fixture() {
  let phase: SessionState = 'REENTRY'
  const readWindow = vi.fn<() => Promise<WindowInfo | undefined>>().mockResolvedValue(task)
  const recognize = vi.fn<(_png: string, _area: unknown, signal: AbortSignal) => Promise<OcrBox[]>>().mockResolvedValue([box])
  const requestFrame = vi.fn(async () => ({ pngBase64: 'synthetic' }))
  const log = vi.fn()
  const document = new DocumentReentry({ getPhase: () => phase, getTask: () => task,
    getDisplay: () => ({ x: 0, y: 0, width: 1408, height: 881 }), getExclusions: () => [],
    readWindow, requestFrame, recognize, log })
  return { document, readWindow, recognize, requestFrame, log, phase: (value: SessionState) => { phase = value } }
}

describe('document re-entry', () => {
  it('sends numbered lines and resolves the exact same boxes for a pin, including after phase completion', async () => {
    const f = fixture()
    expect(await f.document.readLines()).toEqual([`L1: ${box.text}`])
    f.phase('FOCUSED'); f.document.finish()
    const anchor = await f.document.locateLine('L1')
    expect(anchor?.x).toBeCloseTo(box.x)
    expect(anchor?.y).toBeCloseTo(box.y)
    expect(anchor?.w).toBeCloseTo(box.w)
    expect(anchor?.h).toBeCloseTo(box.h)
    expect(await f.document.locateLine('L99')).toBeUndefined()
    expect(await f.document.locateLine('none')).toBeUndefined()
  })
  it('falls back when OCR fails or the foreground task moves away during capture', async () => {
    const f = fixture()
    f.recognize.mockRejectedValueOnce(new Error('Helper failed'))
    expect(await f.document.readLines()).toEqual([])
    expect(f.log).toHaveBeenCalledOnce()
    f.readWindow.mockResolvedValueOnce(task).mockResolvedValueOnce({ ...task, url: 'https://example.com/other' })
    expect(await f.document.readLines()).toEqual([])
    expect(f.recognize).toHaveBeenCalledTimes(2)
  })
  it('cancels pending OCR and discards its boxes after Pause/End or another return', async () => {
    const f = fixture()
    let finish!: (boxes: OcrBox[]) => void
    f.recognize.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = f.document.readLines()
    await vi.waitFor(() => expect(f.recognize).toHaveBeenCalledOnce())
    f.document.reset(); f.phase('PAUSED')
    expect(f.recognize.mock.calls[0]?.[2].aborted).toBe(true)
    finish([box])
    expect(await pending).toEqual([])
    expect(await f.document.locateLine('L1')).toBeUndefined()
  })
  it('uses the margin in the current window when it moved since OCR', async () => {
    const f = fixture()
    await f.document.readLines()
    const moved = { ...task, bounds: { ...task.bounds, x: 100, width: 1200 } }
    f.readWindow.mockResolvedValue(moved)
    expect(await f.document.locateLine('L1')).toBeUndefined()
    expect(f.document.taskWindow).toEqual(moved)
  })
})
