import { runToolCall, type ToolHandlers } from '../gemini/tools'
import type { LiveClient, LiveEvent, LiveSessionContext, LiveTurn } from '../gemini/types'
import type { LanguageCode } from '../../shared/languages'

export interface LiveSessionSinks {
  playAudio(pcm24Base64: string): void
  flushAudio(): void
  resetAudio(): void
  caption(text: string): void
  userSpeech(text: string): void
  micSet(open: boolean): void
  connection(state: 'connected' | 'reconnecting' | 'degraded' | 'disconnected'): void
  resumptionHandle(receivedAt: number): void
  error(message: string): void
}

/** Main-process boundary between the Live transport, media IPC, and session effects. */
export class LiveSessionBridge {
  private active = false
  private warming = false
  private disposed = false
  private sessionId = 0
  private startIntent = 0
  private micOpen = false
  private quietMode = false
  private stopping?: Promise<void>
  private readonly unsubscribe: () => void

  constructor(
    private readonly client: LiveClient,
    private readonly handlers: ToolHandlers,
    private readonly sinks: LiveSessionSinks,
  ) {
    this.unsubscribe = client.onEvent((event) => { void this.onEvent(event) })
  }

  warmup(language: LanguageCode = 'en'): void {
    if (this.active || this.disposed) return
    this.warming = true
    const intent = this.startIntent
    void this.client.warmup(language).catch(() => {
      if (!this.warming || this.disposed || intent !== this.startIntent) return
      this.sinks.error('Live connection warmup failed')
      this.sinks.connection('degraded')
    })
  }

  async start(context: LiveSessionContext): Promise<void> {
    const intent = ++this.startIntent
    if (this.stopping) await this.stopping
    if (this.disposed || intent !== this.startIntent) throw new Error('Study session start was cancelled')
    if (this.active) throw new Error('A study session is already active')
    const sessionId = ++this.sessionId
    this.active = true
    this.warming = false
    // A slow handshake must not block capture, polling, or queuing the greeting/checks.
    void this.client.connect(context).catch((error: unknown) => {
      if (this.active && this.sessionId === sessionId) {
        this.sinks.error(error instanceof Error ? error.message : 'Live connection failed')
        this.sinks.connection('degraded')
      }
    })
  }

  updateContext(context: LiveSessionContext): void { if (this.active) this.client.updateContext(context) }
  sendTurn(turn: LiveTurn): void { if (this.active) this.client.sendTurn(turn) }
  trySendHabitReview(turn: LiveTurn): boolean { return this.active && !this.micOpen && this.client.trySendHabitReview(turn) }
  sendFrame(jpegBase64: string): void { if (this.active) this.client.sendFrame(jpegBase64) }
  sendMicChunk(pcm16Base64: string): void { if (this.active && this.micOpen) this.client.sendAudio(pcm16Base64) }
  setCheckinActive(active: boolean): void { this.client.setCheckinActive(active) }

  setQuietMode(enabled: boolean): void {
    if (this.quietMode === enabled) return
    this.quietMode = enabled
    if (enabled) {
      this.setMicOpen(false)
      this.sinks.flushAudio()
    }
  }

  setMicOpen(open: boolean): void {
    const allowed = open && !this.quietMode
    if (!this.active || this.micOpen === allowed) return
    this.micOpen = allowed
    this.sinks.micSet(allowed)
    if (!allowed) this.client.endAudioStream()
  }

  stop(): Promise<void> {
    this.startIntent += 1
    if (this.stopping) return this.stopping
    if (!this.active && !this.warming) return Promise.resolve()
    this.setMicOpen(false)
    this.active = false
    this.warming = false
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

  dispose(): void { this.disposed = true; void this.stop(); this.unsubscribe() }

  private async onEvent(event: LiveEvent): Promise<void> {
    if (!this.active) {
      if (!this.warming) return
      if (event.type === 'connection') this.sinks.connection(event.state)
      else if (event.type === 'resumption-handle') this.sinks.resumptionHandle(event.receivedAt)
      else if (event.type === 'error') this.sinks.error(event.message)
      else if (event.type === 'tool-call') this.client.sendToolResponse({
        id: event.call.id, name: event.call.name, response: { ok: false, error: 'No study session has started.' },
        scheduling: 'silent',
      })
      return
    }
    const sessionId = this.sessionId
    switch (event.type) {
      case 'connection':
        if (event.state === 'reconnecting' || event.state === 'degraded') {
          this.sinks.flushAudio()
          this.sinks.caption('')
        }
        this.sinks.connection(event.state)
        break
      case 'resumption-handle': this.sinks.resumptionHandle(event.receivedAt); break
      case 'tool-call':
        {
          const response = await runToolCall(event.call, this.handlers)
          if (this.active && this.sessionId === sessionId) this.client.sendToolResponse(response)
        }
        break
      case 'audio': if (!this.quietMode) this.sinks.playAudio(event.pcm24Base64); break
      case 'transcription': this.sinks.caption(event.text); break
      case 'user-transcription': this.sinks.userSpeech(event.text); break
      case 'interrupted': this.sinks.flushAudio(); this.sinks.caption(''); break
      case 'generation-complete': break
      case 'check-complete':
        try { await this.handlers.reportStatusFailed?.(event.checkId) }
        catch { this.sinks.error('Screen check completion failed.') }
        break
      case 'error': this.sinks.error(event.message); break
    }
  }
}
