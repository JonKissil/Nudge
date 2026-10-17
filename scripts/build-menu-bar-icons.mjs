// Repo-owned vector geometry, rasterized at 1x and 2x without extra dependencies.
import { mkdirSync, writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { URL, fileURLToPath } from 'node:url'

const output = new URL('../resources/menu-bar/', import.meta.url)
mkdirSync(output, { recursive: true })

function chunk(name, data) {
  const kind = Buffer.from(name)
  let crc = 0xffffffff
  for (const byte of Buffer.concat([kind, data])) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  const size = Buffer.alloc(4)
  size.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([size, kind, data, checksum])
}

function pixel(x, y, active) {
  const radius = Math.hypot(x - 9, y - 9)
  // A round badge and a rounded lowercase n, legible at menu-bar size.
  const stem = Math.min(
    Math.hypot(x - 6, y - Math.max(6, Math.min(12, y))),
    Math.hypot(x - 12, y - Math.max(8.5, Math.min(12, y))),
  ) <= 1
  const arch = y <= 8.5 && Math.abs(Math.hypot(x - 9, y - 8.5) - 3) <= 1
  if (stem || arch) return active ? [255, 255, 255, 255] : [0, 0, 0, 255]
  if (active) {
    if (radius <= 7.25) return [63, 185, 112, 255]
    if (radius <= 8.5) return [93, 226, 144, 90]
  } else if (Math.abs(radius - 7.25) <= 0.75) return [0, 0, 0, 255]
  return [0, 0, 0, 0]
}

for (const active of [false, true]) {
  for (const scale of [1, 2]) {
    const size = 18 * scale
    const rows = Buffer.alloc(size * (1 + size * 4))
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const sums = [0, 0, 0, 0]
        // Supersampling with premultiplied alpha keeps the edges smooth.
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
          const rgba = pixel((x + (sx + 0.5) / 4) / scale, (y + (sy + 0.5) / 4) / scale, active)
          for (let c = 0; c < 3; c++) sums[c] += rgba[c] * rgba[3] / 255
          sums[3] += rgba[3]
        }
        const offset = y * (1 + size * 4) + 1 + x * 4
        for (let c = 0; c < 3; c++) rows[offset + c] = sums[3] ? Math.round(sums[c] * 255 / sums[3]) : 0
        rows[offset + 3] = Math.round(sums[3] / 16)
      }
    }
    const header = Buffer.alloc(13)
    header.writeUInt32BE(size, 0)
    header.writeUInt32BE(size, 4)
    header[8] = 8
    header[9] = 6 // RGBA
    const density = Buffer.alloc(9)
    density.writeUInt32BE(Math.round(72 * scale / 0.0254), 0)
    density.writeUInt32BE(Math.round(72 * scale / 0.0254), 4)
    density[8] = 1
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
      chunk('pHYs', density), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
    ])
    const name = `nudge${active ? 'Active' : 'Template'}${scale === 2 ? '@2x' : ''}.png`
    writeFileSync(fileURLToPath(new URL(name, output)), png)
  }
}
