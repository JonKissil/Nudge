function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export class MicCapture {
  private stream?: MediaStream
  private context?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private worklet?: AudioWorkletNode
  private silence?: GainNode
  private generation = 0

  constructor(private readonly onChunk: (pcm16Base64: string) => void) {}

  async setOpen(open: boolean): Promise<void> {
    const generation = ++this.generation
    this.release()
    if (!open) return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return }
    const context = new AudioContext()
    this.stream = stream
    this.context = context
    try {
      await context.audioWorklet.addModule(new URL('./mic-processor.js', import.meta.url).href)
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        void context.close()
        return
      }
      this.source = context.createMediaStreamSource(stream)
      this.worklet = new AudioWorkletNode(context, 'nudge-mic')
      this.silence = context.createGain()
      this.silence.gain.value = 0
      this.worklet.port.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (generation === this.generation && data instanceof ArrayBuffer) {
          this.onChunk(encodeBase64(new Uint8Array(data)))
        }
      }
      this.source.connect(this.worklet).connect(this.silence).connect(context.destination)
      await context.resume()
    } catch (error) {
      if (generation === this.generation) this.release()
      else {
        stream.getTracks().forEach((track) => track.stop())
        void context.close()
      }
      throw error
    }
  }

  close(): void {
    this.generation += 1
    this.release()
  }

  private release(): void {
    this.source?.disconnect()
    this.worklet?.disconnect()
    this.silence?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    if (this.context) void this.context.close()
    this.source = undefined
    this.worklet = undefined
    this.silence = undefined
    this.stream = undefined
    this.context = undefined
  }
}

export class AudioPlayer {
  private context?: AudioContext
  private worklet?: AudioWorkletNode
  private generation = 0
  private queue: Promise<void> = Promise.resolve()

  play(pcm24Base64: string): Promise<void> {
    const generation = this.generation
    const queued = this.queue.then(() => this.enqueue(pcm24Base64, generation))
    this.queue = queued.catch(() => {})
    return queued
  }

  async chime(cue: 'nudge' | 'return'): Promise<void> {
    const context = this.context ?? new AudioContext({ sampleRate: 24_000 })
    this.context = context
    await context.resume()
    const start = context.currentTime
    const notes: ReadonlyArray<readonly [number, number]> = cue === 'nudge'
      ? [[0, 659], [0.13, 880]] : [[0, 880], [0.12, 1175]]
    for (const [offset, frequency] of notes) {
      const oscillator = context.createOscillator()
      const volume = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      volume.gain.setValueAtTime(0.0001, start + offset)
      volume.gain.exponentialRampToValueAtTime(0.035, start + offset + 0.025)
      volume.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18)
      oscillator.connect(volume).connect(context.destination)
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect() }
      oscillator.start(start + offset)
      oscillator.stop(start + offset + 0.19)
    }
  }

  private async enqueue(pcm24Base64: string, generation: number): Promise<void> {
    if (generation !== this.generation) return
    const raw = atob(pcm24Base64)
    if (raw.length % 2 !== 0) throw new Error('Invalid 16-bit PCM audio chunk')
    if (raw.length === 0) return
    const pcm = new Int16Array(raw.length / 2)
    for (let i = 0; i < pcm.length; i += 1) {
      const unsigned = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)
      pcm[i] = unsigned >= 32768 ? unsigned - 65536 : unsigned
    }
    const worklet = await this.ensureWorklet(generation)
    if (!worklet || generation !== this.generation) return
    worklet.port.postMessage({ type: 'audio', samples: pcm.buffer }, [pcm.buffer])
  }

  private async ensureWorklet(generation: number): Promise<AudioWorkletNode | undefined> {
    if (this.worklet && this.context) {
      await this.context.resume()
      return generation === this.generation ? this.worklet : undefined
    }
    const context = this.context ?? new AudioContext({ sampleRate: 24_000 })
    this.context = context
    await context.audioWorklet.addModule(new URL('./speaker-processor.js', import.meta.url).href)
    if (generation !== this.generation || this.context !== context) return undefined
    const worklet = new AudioWorkletNode(context, 'nudge-speaker', { outputChannelCount: [1] })
    worklet.connect(context.destination)
    this.worklet = worklet
    await context.resume()
    return generation === this.generation ? worklet : undefined
  }

  flush(): void {
    this.generation += 1
    this.worklet?.port.postMessage({ type: 'clear' })
  }

  close(): void {
    this.flush()
    this.worklet?.disconnect()
    this.worklet = undefined
    if (this.context) void this.context.close()
    this.context = undefined
  }
}
