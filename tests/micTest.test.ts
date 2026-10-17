import { describe, expect, it } from 'vitest'
import { pcm16Peak } from '../src/renderer/media/pcm16Peak'

describe('microphone signal measurement', () => {
  it('reads signed 16-bit little-endian samples without saving audio', () => {
    const samples = new Int16Array([0, 8192, -16384, 32767])
    const bytes = new Uint8Array(samples.buffer)
    expect(pcm16Peak(Buffer.from(bytes).toString('base64'))).toBeCloseTo(32767 / 32768)
    expect(pcm16Peak(Buffer.from(new Int16Array([0, 0]).buffer).toString('base64'))).toBe(0)
  })
})
