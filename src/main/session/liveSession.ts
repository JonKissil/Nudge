import { runToolCall, type ToolHandlers } from '../gemini/tools'
import type { LiveClient, LiveEvent, LiveSessionContext, LiveTurn } from '../gemini/types'

export interface LiveSessionSinks {
  playAudio(pcm24Base64: string): void
  flushAudio(): void
  resetAudio(): void
  caption(text: string): void
  userSpeech(text: string): void
  micSet(open: boolean): void
  connection(state: 'connected' | 'reconnecting' | 'degraded' | 'disconnected', restored?: boolean): void
  resumptionHandle(receivedAt: number | null): void
  error(message: string): void
}

/** Main-process boundary between the Live transport, media IPC, and session effects. */
export class LiveSessionBridge {
  private active = false
  private sessionId = 0
  private startIntent = 0
  private micOpen = false
  private stopping?: Promise<void>
  private readonly unsubscribe: () => void

  constructor(
    private readonly client: LiveClient,
    private readonly handlers: ToolHandlers,
    private readonly sinks: LiveSessionSinks,
  ) {
    this.unsubscribe = client.onEvent((event) => { void this.onEvent(event) })
  }

  async start(context: LiveSessionContext): Promise<void> {
    const intent = ++this.startIntent
    if (this.stopping) await this.stopping
    if (intent !== this.startIntent) throw new Error('Study session start was cancelled')
    if (this.active) throw new Error('A study session is already active')
    const sessionId = ++this.sessionId
    this.active = true
    try { await this.client.connect(context) }
    catch (error) {
      if (this.active && this.sessionId === sessionId) {
        this.sinks.error(error instanceof Error ? error.message : 'Live connection failed')
        this.sinks.connection('degraded')
      }
    }
  }

  updateContext(context: LiveSessionContext): void { this.client.updateContext(context) }
  sendTurn(turn: LiveTurn): void { if (this.active) this.client.sendTurn(turn) }
  sendFrame(jpegBase64: string): void { if (this.active) this.client.sendFrame(jpegBase64) }
  sendMicChunk(pcm16Base64: string): void { if (this.active && this.micOpen) this.client.sendAudio(pcm16Base64) }
  setCheckinActive(active: boolean): void { this.client.setCheckinActive(active) }

  setMicOpen(open: boolean): void {
    if (!this.active || this.micOpen === open) return
    this.micOpen = open
    this.sinks.micSet(open)
    if (!open) this.client.endAudioStream()
  }

  stop(): Promise<void> {
    this.startIntent += 1
    if (this.stopping) return this.stopping
    if (!this.active) return Promise.resolve()
    this.setMicOpen(false)
    this.active = false
    this.sessionId += 1
    this.sinks.resetAudio()
    this.sinks.caption('')
    const stopping = (async () => {
      try { await this.client.disconnect() }
      finally { this.sinks.connection('disconnected') }
    })()
    this.stopping = stopping
    const clearStopping = (): void => { if (this.stopping === stopping) this.stopping = undefined }
    void stopping.then(clearStopping, clearStopping)
    return stopping
  }

  dispose(): void { this.unsubscribe() }

  private async onEvent(event: LiveEvent): Promise<void> {
    if (!this.active) return
    const sessionId = this.sessionId
    switch (event.type) {
      case 'connection':
        if (event.state === 'reconnecting' || event.state === 'degraded') {
          this.sinks.flushAudio()
          this.sinks.caption('')
        }
        this.sinks.connection(event.state, event.restored)
        break
      case 'resumption-handle': this.sinks.resumptionHandle(event.receivedAt); break
      case 'tool-call':
        {
          const response = await runToolCall(event.call, this.handlers)
          if (this.active && this.sessionId === sessionId) {
            this.client.sendToolResponse({ ...response, sessionEpoch: event.sessionEpoch })
          }
        }
        break
      case 'audio': this.sinks.playAudio(event.pcm24Base64); break
      case 'transcription': this.sinks.caption(event.text); break
      case 'user-transcription': this.sinks.userSpeech(event.text); break
      case 'interrupted': this.sinks.flushAudio(); this.sinks.caption(''); break
      case 'generation-complete': break
      case 'error': this.sinks.error(event.message); break
    }
  }
}
