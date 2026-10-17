import { app, nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { NormalizedBox } from '../../shared/types'
import { mapCropBoxes } from './geometry'
import { OcrBoxSchema, type OcrBox } from './tabStrip'
import { TesseractOcr } from './tesseract'

export class OcrService {
  private readonly fallback = new TesseractOcr(app.getAppPath())
  private warned = false

  constructor(private readonly log: (message: string) => void) {}

  /** Crop before recognition; map the crop's boxes back into full-display coordinates. */
  async readRegion(pngBase64: string, region: NormalizedBox, signal?: AbortSignal): Promise<OcrBox[]> {
    signal?.throwIfAborted()
    const image = nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64'))
    if (image.isEmpty()) throw new Error('The current screen could not be read.')
    const size = image.getSize()
    const x = Math.max(0, Math.floor(region.x * size.width)), y = Math.max(0, Math.floor(region.y * size.height))
    const width = Math.min(size.width, Math.ceil((region.x + region.w) * size.width)) - x
    const height = Math.min(size.height, Math.ceil((region.y + region.h) * size.height)) - y
    if (width <= 0 || height <= 0) return []
    const png = image.crop({ x, y, width, height }).toPNG()
    const path = app.isPackaged ? join(process.resourcesPath, 'bin/ocr-helper')
      : join(app.getAppPath(), 'resources/bin/ocr-helper')
    let available = true
    try { accessSync(path, constants.X_OK) } catch { available = false }
    let boxes: OcrBox[]
    if (available) boxes = await this.readVision(path, png, signal)
    else {
      if (!this.warned) { this.warned = true; this.log('Vision helper unavailable; using local Tesseract OCR (slower). Run npm run build:ocr to restore Vision.') }
      boxes = await this.fallback.read(png, width, height, signal)
    }
    signal?.throwIfAborted()
    return mapCropBoxes(boxes, { x: x / size.width, y: y / size.height, w: width / size.width, h: height / size.height })
  }

  private readVision(path: string, png: Buffer, signal?: AbortSignal): Promise<OcrBox[]> {
    return new Promise((resolve, reject) => {
      const child = execFile(path, ['-'], { signal, timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
        if (error) { reject(new Error('Document text recognition is unavailable.')); return }
        try { resolve(z.array(OcrBoxSchema).max(5000).parse(JSON.parse(stdout))) }
        catch { reject(new Error('Text recognition returned an invalid result.')) }
      })
      child.stdin?.on('error', () => {})
      child.stdin?.end(png)
    })
  }

  dispose(): void { this.fallback.dispose() }
}
