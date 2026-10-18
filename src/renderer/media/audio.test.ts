import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioPlayer } from './audio'

class FakeWorklet {
  static instances: FakeWorklet[] = []
  readonly messages: unknown[] = []
  readonly port = {
    postMessage: (message: unknown) => { this.messages.push(message) },
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
  }
  disconnected = false
  constructor() { FakeWorklet.instances.push(this) }
  connect(): void {}
  disconnect(): void { this.disconnected = true }
}

class FakeContext {
  static instances: FakeContext[] = []
  readonly destination = {}
  readonly audioWorklet = { addModule: vi.fn(async () => {}) }
  closed = false
  constructor(readonly options: AudioContextOptions) { FakeContext.instances.push(this) }
  async resume(): Promise<void> {}
  async close(): Promise<void> { this.closed = true }
}

function pcm(...samples: number[]): string {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true))
  return btoa(String.fromCharCode(...bytes))
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    FakeContext.instances = []
    FakeWorklet.instances = []
    vi.stubGlobal('AudioContext', FakeContext)
    vi.stubGlobal('AudioWorkletNode', FakeWorklet)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends ordered 24 kHz PCM to one continuous speaker worklet', async () => {
    const player = new AudioPlayer()
    await player.play(pcm(-32768, 0, 32767))
    await player.play(pcm(12, -12))
    const context = FakeContext.instances[0]!
    const worklet = FakeWorklet.instances[0]!
    expect(context.options.sampleRate).toBe(24_000)
    expect(context.audioWorklet.addModule).toHaveBeenCalledOnce()
    expect(FakeWorklet.instances).toHaveLength(1)
    expect(worklet.messages).toHaveLength(2)
    expect(new Int16Array((worklet.messages[0] as { samples: ArrayBuffer }).samples)).toEqual(
      new Int16Array([-32768, 0, 32767]),
    )
    expect(new Int16Array((worklet.messages[1] as { samples: ArrayBuffer }).samples)).toEqual(
      new Int16Array([12, -12]),
    )
    player.close()
    expect(worklet.messages.at(-1)).toEqual({ type: 'clear' })
    expect(worklet.disconnected).toBe(true)
    expect(context.closed).toBe(true)
    await player.play(pcm(42))
    expect(FakeContext.instances).toHaveLength(2)
    expect(FakeWorklet.instances).toHaveLength(2)
    expect(new Int16Array((FakeWorklet.instances[1]!.messages[0] as { samples: ArrayBuffer }).samples))
      .toEqual(new Int16Array([42]))
    player.close()
  })

  it('clears buffered speech on interruption', async () => {
    const player = new AudioPlayer()
    await player.play(pcm(1))
    player.flush()
    await player.play(pcm(2))
    expect(FakeWorklet.instances[0]!.messages.map((message) =>
      (message as { type: string }).type)).toEqual(['audio', 'clear', 'audio'])
    player.close()
  })

  it('forwards real playback progress and rejects old updates after flush/restart', async () => {
    const progress = vi.fn()
    const player = new AudioPlayer(progress)
    await player.play(pcm(1, 2), 7)
    const worklet = FakeWorklet.instances[0]!
    const report = (playbackId: number, playedSamples: number): void => {
      worklet.port.onmessage!({ data: { playbackId, playedSamples } } as MessageEvent<unknown>)
    }
    report(7, 2)
    expect(progress).toHaveBeenLastCalledWith({ playbackId: 7, playedSamples: 2 })
    player.flush()
    report(7, 3)
    await player.play(pcm(3), 8)
    report(7, 4)
    report(8, -1)
    expect(progress).toHaveBeenCalledTimes(1)
    report(8, 1)
    expect(progress).toHaveBeenLastCalledWith({ playbackId: 8, playedSamples: 1 })
    player.close()
  })

  it('rejects incomplete PCM samples', async () => {
    const player = new AudioPlayer()
    await expect(player.play(btoa(String.fromCharCode(0)))).rejects.toThrow('Invalid 16-bit PCM')
    player.close()
  })
})
