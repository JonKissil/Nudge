import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type Speaker = {
  port: { onmessage: (event: { data: unknown }) => void }
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean
}

function makeSpeaker(): Speaker {
  let SpeakerClass: new () => Speaker
  const source = readFileSync(new URL('../src/renderer/media/speaker-processor.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    AudioWorkletProcessor: class { port = { onmessage: () => {} } },
    sampleRate: 24_000,
    registerProcessor: (_name: string, processor: new () => Speaker) => { SpeakerClass = processor },
    Int16Array,
    ArrayBuffer,
    Math,
  })
  return new SpeakerClass!()
}

function render(speaker: Speaker, frames: number): number[] {
  const result: number[] = []
  for (let offset = 0; offset < frames; offset += 128) {
    const output = new Float32Array(Math.min(128, frames - offset))
    speaker.process([], [[output]])
    result.push(...output)
  }
  return result
}

describe('speaker worklet', () => {
  it('keeps speech continuous when the next chunk arrives during playback', () => {
    const speaker = makeSpeaker()
    const first = new Int16Array(7_200).fill(8_000)
    const second = new Int16Array(7_200).fill(8_000)
    speaker.port.onmessage({ data: { type: 'audio', samples: first.buffer } })
    const beforeDelivery = render(speaker, 2_400)
    speaker.port.onmessage({ data: { type: 'audio', samples: second.buffer } })
    const output = [...beforeDelivery, ...render(speaker, 12_000)]
    const audible = output.findIndex((value) => value > 0.1)
    expect(audible).toBeGreaterThanOrEqual(0)
    expect(output.slice(audible + 150, 14_000).every((value) => value > 0.2)).toBe(true)
    expect(Math.abs(output[7_200]! - output[7_199]!)).toBeLessThan(0.001)
  })

  it('fades to silence when audio delivery runs dry', () => {
    const speaker = makeSpeaker()
    const chunk = new Int16Array(2_400).fill(16_000)
    speaker.port.onmessage({ data: { type: 'audio', samples: chunk.buffer } })
    const output = render(speaker, 8_000)
    const lastAudible = output.reduce((last, value, index) => value > 0 ? index : last, -1)
    expect(lastAudible).toBeGreaterThan(0)
    expect(output[lastAudible]!).toBeLessThan(0.01)
    expect(output.slice(lastAudible + 1).every((value) => value === 0)).toBe(true)
  })
})
