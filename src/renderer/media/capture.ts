import type { MediaApi } from '../../shared/bridge'
import { DEFAULTS } from '../../shared/config'
import { grayscale, shouldSendFrame } from './frameDiff'
import type { CapturePolicy } from '../../shared/privacy'
import { paintPrivateFrame } from './privacyCanvas'

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result.slice(reader.result.indexOf(',') + 1)) : reject(new Error('Encoding failed'))
    reader.onerror = () => reject(new Error('Encoding failed'))
    reader.readAsDataURL(blob)
  })
}

export class ScreenCapture {
  private readonly video = document.createElement('video')
  private readonly small = new OffscreenCanvas(64, 36)
  private readonly encoded = new OffscreenCanvas(DEFAULTS.frameWidth, 1)
  private stream?: MediaStream
  private timer?: ReturnType<typeof setInterval>
  private videoCallback?: number
  private previous?: Uint8Array
  private lastSentAt?: number
  private wanted = false
  private generation = 0
  private encoding = false
  private operation = Promise.resolve()
  private policy?: CapturePolicy
  private revision = 0
  private commandId = 0

  constructor(private readonly api: MediaApi) {
    this.video.muted = true
    this.video.playsInline = true
  }

  setRunning(running: boolean, policy?: CapturePolicy, revision = policy?.revision ?? 0, commandId = 0): void {
    if (this.policy?.revision !== policy?.revision) this.stop()
    this.policy = policy
    this.revision = revision
    this.commandId = commandId
    this.wanted = running && Boolean(policy)
    this.generation++
    const generation = this.generation
    if (!this.wanted) { this.stop(); this.status('off') }
    // Serialize getDisplayMedia calls; pause cancels pending starts before they can send frames.
    this.operation = this.operation.then(() => this.startIfNeeded()).catch(() => {
      if (generation !== this.generation) return
      this.stop()
      if (this.wanted && generation === this.generation) this.status('error', 'Screen capture could not start. Check Screen Recording permission and restart the app.')
    })
  }

  private status(state: 'off' | 'starting' | 'running' | 'error', error?: string): void {
    this.api.sendCaptureStatus({ state, error, revision: this.revision, commandId: this.commandId })
  }

  private async startIfNeeded(): Promise<void> {
    if (!this.wanted || this.stream) return
    const generation = this.generation
    this.status('starting')
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: DEFAULTS.frameMaxFps }, audio: false })
    if (!this.wanted || generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return }
    this.stream = stream
    this.video.srcObject = stream
    await this.video.play()
    if (!this.wanted || generation !== this.generation) { this.stop(); return }
    for (const track of stream.getVideoTracks()) track.onended = () => {
      this.wanted = false
      this.generation++
      this.stop()
      this.status('off')
    }
    this.status('running')
    const nextVideoFrame = (): void => {
      this.videoCallback = this.video.requestVideoFrameCallback(() => {
        void this.sample()
        if (this.stream) nextVideoFrame()
      })
    }
    nextVideoFrame()
    // Static desktops may stop delivering new video callbacks; still emit the 5s keyframe.
    this.timer = setInterval(() => { void this.sample() }, 500)
    await this.sample()
  }

  private async sample(): Promise<void> {
    if (!this.wanted || !this.stream || this.encoding || !this.video.videoWidth || !this.policy) return
    const generation = this.generation
    const policy = this.policy
    this.encoding = true
    try {
      const context = this.small.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas unavailable')
      paintPrivateFrame(this.encoded, this.video, policy, DEFAULTS.frameWidth)
      context.drawImage(this.encoded, 0, 0, 64, 36)
      const gray = grayscale(context.getImageData(0, 0, 64, 36).data)
      if (!shouldSendFrame(gray, this.previous, this.lastSentAt, performance.now(), DEFAULTS)) return
      const jpegBase64 = await base64(await this.encoded.convertToBlob({ type: 'image/jpeg', quality: DEFAULTS.jpegQuality }))
      if (!this.wanted || generation !== this.generation) return
      this.api.sendFrame({ jpegBase64, width: this.encoded.width, height: this.encoded.height, ts: Date.now(), revision: policy.revision })
      this.previous = gray
      this.lastSentAt = performance.now()
    } catch {
      if (generation !== this.generation) return
      this.wanted = false
      this.generation++
      this.stop()
      if (generation === this.generation) this.status('error', 'Screen capture stopped because a frame could not be encoded.')
    } finally { this.encoding = false }
  }

  async sendFullFrame(): Promise<void> {
    if (!this.wanted || !this.stream || !this.video.videoWidth || !this.policy) return
    const generation = this.generation
    const policy = this.policy
    try {
      // At 1 fps the video can still show the previous tab. Wait for a fresh frame
      // before OCR; a static desktop may deliver none, so bound the wait.
      await new Promise<void>((resolve) => {
        const callback = this.video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve() })
        const timer = setTimeout(() => { this.video.cancelVideoFrameCallback(callback); resolve() }, 1200)
      })
      if (!this.wanted || generation !== this.generation) return
      const canvas = new OffscreenCanvas(1, 1)
      paintPrivateFrame(canvas, this.video, policy, Math.round(policy.display.width * policy.scaleFactor))
      const pngBase64 = await base64(await canvas.convertToBlob({ type: 'image/png' }))
      if (this.wanted && generation === this.generation) {
        this.api.sendFullFrame({ pngBase64, width: canvas.width, height: canvas.height, revision: policy.revision })
        this.status('running')
      }
    } catch {
      if (this.wanted && generation === this.generation) {
        this.status('running', 'The full-resolution frame could not be prepared or sent.')
      }
    }
  }

  dispose(): void { this.wanted = false; this.generation++; this.stop() }

  private stop(): void {
    clearInterval(this.timer)
    if (this.videoCallback !== undefined) this.video.cancelVideoFrameCallback(this.videoCallback)
    for (const track of this.stream?.getTracks() ?? []) { track.onended = null; track.stop() }
    this.stream = undefined
    this.video.pause()
    this.video.srcObject = null
    this.previous = undefined
    this.lastSentAt = undefined
  }
}
