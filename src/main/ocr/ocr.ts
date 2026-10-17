import { app, nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { z } from 'zod'
import { OcrBoxSchema, TAB_STRIP_HEIGHT, type OcrBox } from './tabStrip'

/** Run Vision on just the tab strip, piping PNG bytes instead of persisting a frame. */
export function readTabStrip(pngBase64: string): Promise<OcrBox[]> {
  return new Promise((resolve, reject) => {
    const image = nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64'))
    if (image.isEmpty()) { reject(new Error('The current screen could not be read.')); return }
    const { width, height } = image.getSize()
    const crop = image.crop({ x: 0, y: 0, width, height: Math.max(1, Math.round(height * TAB_STRIP_HEIGHT)) })
    const path = app.isPackaged ? join(process.resourcesPath, 'bin/ocr-helper')
      : join(app.getAppPath(), 'resources/bin/ocr-helper')
    const child = execFile(path, ['-'], { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(new Error('Tab text recognition is unavailable; use npm run build:ocr.')); return }
      try { resolve(z.array(OcrBoxSchema).max(1000).parse(JSON.parse(stdout))) }
      catch { reject(new Error('Tab text recognition returned an invalid result.')) }
    })
    child.stdin?.on('error', () => {}) // Spawn failures are reported by execFile's callback.
    child.stdin?.end(crop.toPNG())
  })
}
