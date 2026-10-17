import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Worker } from 'tesseract.js'
import { OcrBoxSchema, type OcrBox } from './tabStrip'

/** All model/worker files are local dependencies. Images stay in the worker's memory. */
export class TesseractOcr {
  private worker?: Promise<Worker>
  private generation = 0
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly appPath: string) {}

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      const require = createRequire(join(this.appPath, 'package.json'))
      const langPath = join(dirname(require.resolve('@tesseract.js-data/eng')), '4.0.0_best_int')
      const pending = import('tesseract.js').then(({ createWorker, OEM }) => createWorker('eng', OEM.LSTM_ONLY, {
        langPath, cacheMethod: 'none', logger: () => {}, errorHandler: () => {},
      }))
      this.worker = pending
      pending.catch(() => { if (this.worker === pending) this.worker = undefined })
    }
    return this.worker
  }

  read(png: Buffer, width: number, height: number, signal?: AbortSignal): Promise<OcrBox[]> {
    const read = this.tail.then(() => this.recognize(png, width, height, signal))
    this.tail = read.catch(() => {})
    return read
  }

  private async recognize(png: Buffer, width: number, height: number, signal?: AbortSignal): Promise<OcrBox[]> {
    signal?.throwIfAborted()
    const generation = this.generation
    let abort: () => void = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => { this.dispose(); reject(new Error('Text recognition cancelled.')) }
      signal?.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => { this.dispose(); reject(new Error('Text recognition timed out.')) }, 6000)
    })
    try {
      const recognize = this.getWorker().then(async (worker) => {
        signal?.throwIfAborted()
        if (generation !== this.generation) throw new Error('Text recognition cancelled.')
        const { data } = await worker.recognize(png, {}, { blocks: true, text: true })
        return (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
          .map((line) => OcrBoxSchema.parse({ text: line.text.trim(),
            x: Math.max(0, line.bbox.x0 / width), y: Math.max(0, line.bbox.y0 / height),
            w: Math.min(width, line.bbox.x1) / width - Math.max(0, line.bbox.x0 / width),
            h: Math.min(height, line.bbox.y1) / height - Math.max(0, line.bbox.y0 / height),
          }))
      })
      return await Promise.race([recognize, cancelled])
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }

  dispose(): void {
    this.generation++
    const worker = this.worker
    this.worker = undefined
    void worker?.then((ready) => ready.terminate()).catch(() => {})
  }
}
