import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type Speaker = {
  port: { onmessage: (event: { data: unknown }) => void; postMessage: (message: unknown) => void }
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean
}

function makeSpeaker(): Speaker {
  let SpeakerClass: new () => Speaker
  const source = readFileSync(new URL('../src/renderer/media/speaker-processor.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    AudioWorkletProcessor: class { port = { onmessage: () => {}, postMessage: () => {} } },
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
  it('reports only consumed PCM samples, excluding startup buffering and silence', () => {
    const speaker = makeSpeaker()
    const progress: unknown[] = []
    speaker.port.postMessage = (message) => { progress.push(message) }
    speaker.port.onmessage({ data: { type: 'audio', playbackId: 7, samples: new Int16Array(1_000).buffer } })
    render(speaker, 128)
    expect(progress).toEqual([])
    render(speaker, 8_000)
    expect(progress.at(-1)).toEqual({ type: 'progress', playbackId: 7, playedSamples: 1_000 })
    const count = progress.length
    render(speaker, 12_000)
    expect(progress).toHaveLength(count)
    speaker.port.onmessage({ data: { type: 'clear' } })
    speaker.port.onmessage({ data: { type: 'audio', playbackId: 8, samples: new Int16Array(400).buffer } })
    render(speaker, 8_000)
    expect(progress.at(-1)).toEqual({ type: 'progress', playbackId: 8, playedSamples: 400 })
  })

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

  it('raises volume smoothly when a delayed chunk refills a nearly empty queue', () => {
    const speaker = makeSpeaker()
    const first = new Int16Array(4_800).fill(16_000)
    speaker.port.onmessage({ data: { type: 'audio', samples: first.buffer } })
    const beforeRefill = render(speaker, 4_704)
    const second = new Int16Array(4_800).fill(16_000)
    speaker.port.onmessage({ data: { type: 'audio', samples: second.buffer } })
    const afterRefill = render(speaker, 192)
    const aroundRefill = [...beforeRefill.slice(-1), ...afterRefill]
    const largestStep = aroundRefill.reduce((largest, value, index) =>
      index === 0 ? largest : Math.max(largest, Math.abs(value - aroundRefill[index - 1]!)), 0)
    expect(largestStep).toBeLessThan(0.01)
    expect(afterRefill.at(-1)).toBeGreaterThan(0.48)
  })
})
