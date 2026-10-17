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
  private nextStart = 0
  private readonly sources = new Set<AudioBufferSourceNode>()
  private generation = 0
  private queue: Promise<void> = Promise.resolve()

  play(pcm24Base64: string): Promise<void> {
    const generation = this.generation
    const queued = this.queue.then(() => this.schedule(pcm24Base64, generation))
    this.queue = queued.catch(() => {})
    return queued
  }

  private async schedule(pcm24Base64: string, generation: number): Promise<void> {
    if (generation !== this.generation) return
    const context = this.context ?? new AudioContext()
    this.context = context
    await context.resume()
    if (generation !== this.generation) return
    const raw = atob(pcm24Base64)
    const count = Math.floor(raw.length / 2)
    if (count === 0) return
    const buffer = context.createBuffer(1, count, 24_000)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < count; i += 1) {
      const unsigned = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)
      const signed = unsigned >= 32768 ? unsigned - 65536 : unsigned
      samples[i] = signed / 32768
    }
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.onended = () => { this.sources.delete(source); source.disconnect() }
    this.sources.add(source)
    this.nextStart = Math.max(context.currentTime, this.nextStart)
    source.start(this.nextStart)
    this.nextStart += buffer.duration
  }

  flush(): void {
    this.generation += 1
    for (const source of this.sources) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.sources.clear()
    this.nextStart = this.context?.currentTime ?? 0
  }

  close(): void {
    this.flush()
    if (this.context) void this.context.close()
    this.context = undefined
  }
}
