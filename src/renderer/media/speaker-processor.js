/* global AudioWorkletProcessor, sampleRate, registerProcessor */
/* Keep Gemini's 24 kHz PCM in one stream. WebSocket chunks are transport packets,
   not audio boundaries, so playback must not restart or resample at each packet. */
class NudgeSpeakerProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunks = []
    this.offset = 0
    this.buffered = 0
    this.playing = false
    this.waited = 0
    this.fadeIn = 0
    this.fadeSamples = Math.max(1, Math.round(sampleRate * 0.006))
    this.cushionSamples = Math.round(sampleRate * 0.18)
    this.lastOutput = 0
    this.tail = 0
    this.tailValue = 0
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'clear') {
        this.chunks = []
        this.offset = 0
        this.buffered = 0
        this.playing = false
        this.waited = 0
        this.tail = this.fadeSamples
        this.tailValue = this.lastOutput
      } else if (data?.type === 'audio' && data.samples instanceof ArrayBuffer) {
        const samples = new Int16Array(data.samples)
        if (samples.length > 0) {
          this.chunks.push(samples)
          this.buffered += samples.length
        }
      }
    }
  }

  nextSample() {
    const chunk = this.chunks[0]
    if (!chunk) return 0
    const sample = chunk[this.offset] / 32768
    this.offset += 1
    this.buffered -= 1
    if (this.offset === chunk.length) {
      this.chunks.shift()
      this.offset = 0
    }
    return sample
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0]
    if (!output) return true
    if (!this.playing && this.buffered > 0) {
      this.waited += output.length
      if (this.buffered >= this.cushionSamples || this.waited >= this.cushionSamples) {
        this.playing = true
        this.waited = 0
        this.fadeIn = this.fadeSamples
      }
    }
    for (let i = 0; i < output.length; i += 1) {
      let value = 0
      if (this.playing && this.buffered > 0) {
        value = this.nextSample()
        if (this.fadeIn > 0) {
          value *= 1 - this.fadeIn / this.fadeSamples
          this.fadeIn -= 1
        }
        // If delivery runs dry, approach silence before the final sample.
        // If another packet arrives in time, its samples remain continuous.
        if (this.buffered < this.fadeSamples) value *= this.buffered / this.fadeSamples
        if (this.buffered === 0) {
          this.playing = false
          this.waited = 0
        }
      } else if (this.tail > 0) {
        value = this.tailValue * this.tail / this.fadeSamples
        this.tail -= 1
      }
      output[i] = value
      this.lastOutput = value
    }
    return true
  }
}

registerProcessor('nudge-speaker', NudgeSpeakerProcessor)
