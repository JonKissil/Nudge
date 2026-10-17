/* global AudioWorkletProcessor, sampleRate, registerProcessor */
/* AudioWorklet: collect 40 ms of input, then downsample to 16 kHz PCM16. */
class NudgeMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = []
    this.chunkSize = Math.round(sampleRate * 0.04)
  }

  process(inputs) {
    const mono = inputs[0]?.[0]
    if (!mono) return true
    for (const sample of mono) this.samples.push(sample)
    while (this.samples.length >= this.chunkSize) {
      const source = this.samples.splice(0, this.chunkSize)
      const pcm = new Int16Array(640)
      for (let i = 0; i < pcm.length; i += 1) {
        const from = Math.floor(i * source.length / pcm.length)
        const to = Math.max(from + 1, Math.floor((i + 1) * source.length / pcm.length))
        let sum = 0
        for (let j = from; j < to; j += 1) sum += source[j]
        const sample = Math.max(-1, Math.min(1, sum / (to - from)))
        pcm[i] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767)
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer])
    }
    return true
  }
}

registerProcessor('nudge-mic', NudgeMicProcessor)
