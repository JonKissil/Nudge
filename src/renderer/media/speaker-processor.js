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
    this.gain = 0
    this.fadeSamples = Math.max(1, Math.round(sampleRate * 0.006))
    this.cushionSamples = Math.round(sampleRate * 0.18)
    this.lastOutput = 0
    this.tail = 0
    this.tailValue = 0
    this.playbackId = 0
    this.playedSamples = 0
    this.reportedSamples = 0
    this.reportInterval = 0
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'clear') {
        this.chunks = []
        this.offset = 0
        this.buffered = 0
        this.playing = false
        this.waited = 0
        this.gain = 0
        this.tail = this.fadeSamples
        this.tailValue = this.lastOutput
        this.playedSamples = 0
        this.reportedSamples = 0
        this.reportInterval = 0
      } else if (data?.type === 'audio' && data.samples instanceof ArrayBuffer) {
        this.playbackId = data.playbackId ?? 0
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
    this.playedSamples += 1
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
        this.gain = 0
      }
    }
    for (let i = 0; i < output.length; i += 1) {
      let value = 0
      if (this.playing && this.buffered > 0) {
        const sample = this.nextSample()
        // A late packet can arrive while the queue is nearly empty. Limit the
        // gain's rise as well as its fall so refilling cannot make a sharp pop.
        const targetGain = Math.min(1, this.buffered / this.fadeSamples)
        this.gain = Math.min(targetGain, this.gain + 1 / this.fadeSamples)
        value = sample * this.gain
        if (this.buffered === 0) {
          this.playing = false
          this.waited = 0
          this.gain = 0
        }
      } else if (this.tail > 0) {
        value = this.tailValue * this.tail / this.fadeSamples
        this.tail -= 1
      }
      output[i] = value
      this.lastOutput = value
    }
    this.reportInterval += output.length
    if ((this.reportInterval >= sampleRate / 10 || this.buffered === 0)
      && this.playedSamples !== this.reportedSamples) {
      this.port.postMessage({ type: 'progress', playbackId: this.playbackId, playedSamples: this.playedSamples })
      this.reportedSamples = this.playedSamples
      this.reportInterval = 0
    }
    return true
  }
}

registerProcessor('nudge-speaker', NudgeSpeakerProcessor)
