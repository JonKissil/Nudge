import {
  Behavior, FunctionResponseScheduling, GoogleGenAI, MediaResolution, Modality,
} from '@google/genai'
import type { LiveConnectConfig, LiveServerMessage, Part, Session } from '@google/genai'
import { DEFAULTS } from '../../shared/config'
import type { LanguageCode } from '../../shared/languages'
import { buildLiveConfig } from './config'
import { contextRestoreTurn } from './prompts'
import { TOOL_DECLARATIONS } from './tools'
import type {
  LiveClient, LiveEvent, LiveSessionContext, LiveToolResponse, LiveTurn,
} from './types'

const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 4_000] as const

export class GeminiLiveClient implements LiveClient {
  private ai?: GoogleGenAI
  private session?: Session
  private context?: LiveSessionContext
  private readonly listeners = new Set<(event: LiveEvent) => void>()
  private readonly turns: LiveTurn[] = []
  private readonly responses: LiveToolResponse[] = []
  private readonly audio: string[] = []
  private latestFrame?: string
  private handle?: string
  private active = false
  private lifecycleId = 0
  private connectionId = 0
  private recovery?: { lifecycleId: number; promise: Promise<void> }
  private awaitingTurn = false
  private modelSpeaking = false
  private checkinActive = false
  private frameForCheck?: string
  private activeCheckId?: string
  private checkingSilently = false
  private checkTimer?: ReturnType<typeof setTimeout>
  private warmLanguage?: LanguageCode
  private connecting?: Promise<void>
  private connectionState: 'connected' | 'reconnecting' | 'degraded' | 'disconnected' = 'disconnected'
  private lastConnectionError?: string

  constructor(private readonly apiKey = process.env.GEMINI_API_KEY) {}

  onEvent(listener: (event: LiveEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  updateContext(context: LiveSessionContext): void {
    this.context = context
    if (context.state === 'PAUSED') this.latestFrame = undefined
  }

  setCheckinActive(active: boolean): void {
    this.checkinActive = active
    if (active) {
      for (let i = this.turns.length - 1; i >= 0; i--) if (this.turns[i]?.tag === 'CHECK') this.turns.splice(i, 1)
    }
    this.flushTurns()
  }

  async connect(context: LiveSessionContext): Promise<void> {
    if (this.active && !this.context && this.warmLanguage === context.language && this.connectionState !== 'degraded') {
      this.context = context
      // Supply task details to the already-open, generic study-companion session without generating speech.
      this.sendTurn(contextRestoreTurn(context, context.state ?? 'FOCUSED'))
      await this.connecting
      return
    }
    if (this.active && !this.context) {
      const closing = this.disconnect()
      const lifecycleId = this.lifecycleId
      await closing
      if (lifecycleId !== this.lifecycleId) return
    }
    if (this.active) throw new Error('A Live session is already active')
    await this.establish(context)
  }

  async warmup(language: LanguageCode = 'en'): Promise<void> {
    if (this.active && this.context) return
    if (this.active && this.warmLanguage === language && this.connectionState !== 'degraded') {
      await this.connecting
      return
    }
    if (this.active) {
      const closing = this.disconnect()
      const lifecycleId = this.lifecycleId
      await closing
      if (lifecycleId !== this.lifecycleId) return
    }
    this.warmLanguage = language
    this.connecting = this.establish()
    await this.connecting
  }

  private async establish(context?: LiveSessionContext): Promise<void> {
    const lifecycleId = ++this.lifecycleId
    this.context = context
    this.active = true
    this.handle = undefined
    this.lastConnectionError = undefined
    this.emit({ type: 'connection', state: 'reconnecting' })
    if (!this.apiKey) {
      this.emit({ type: 'error', message: 'GEMINI_API_KEY is missing.' })
      this.emit({ type: 'connection', state: 'degraded' })
      return
    }
    this.ai = new GoogleGenAI({ apiKey: this.apiKey, httpOptions: { apiVersion: 'v1beta' } })
    try {
      await this.open(undefined, lifecycleId)
    } catch (error) {
      this.reportConnectionError(error)
      await this.recover(false, lifecycleId)
    }
  }

  async disconnect(): Promise<void> {
    this.active = false
    this.lifecycleId += 1
    this.connectionId += 1
    this.session?.close()
    this.session = undefined
    this.context = undefined
    this.warmLanguage = undefined
    this.connecting = undefined
    this.handle = undefined
    this.turns.length = 0
    this.responses.length = 0
    this.audio.length = 0
    this.latestFrame = undefined
    this.awaitingTurn = false
    this.modelSpeaking = false
    this.checkinActive = false
    clearTimeout(this.checkTimer)
    this.frameForCheck = undefined
    this.activeCheckId = undefined
    this.checkingSilently = false
    this.recovery = undefined
    this.emit({ type: 'connection', state: 'disconnected' })
  }

  sendTurn(turn: LiveTurn): void {
    // Keep only the newest unsent check when a window changes or a check expires.
    if (turn.tag === 'CHECK') {
      for (let i = this.turns.length - 1; i >= 0; i--) if (this.turns[i]?.tag === 'CHECK') this.turns.splice(i, 1)
    }
    this.turns.push(turn)
    this.flushTurns()
  }

  sendFrame(jpegBase64: string): void {
    this.latestFrame = jpegBase64
    if (!this.session) return
    this.frameForCheck = jpegBase64
    try {
      this.flushTurns()
      // A check consumes this capture in its own turn; all other frames use the video stream.
      if (this.frameForCheck) this.session?.sendRealtimeInput({ video: { data: jpegBase64, mimeType: 'image/jpeg' } })
    } catch {
      void this.beginRecovery()
    } finally { this.frameForCheck = undefined }
  }

  sendAudio(pcm16Base64: string): void {
    this.checkingSilently = false
    if (this.session) {
      try {
        this.session.sendRealtimeInput({ audio: { data: pcm16Base64, mimeType: 'audio/pcm;rate=16000' } })
        return
      } catch { void this.beginRecovery() }
    }
    this.audio.push(pcm16Base64)
    if (this.audio.length > 50) this.audio.shift()
  }

  endAudioStream(): void {
    this.audio.length = 0
    try { this.session?.sendRealtimeInput({ audioStreamEnd: true }) }
    catch { void this.beginRecovery() }
  }

  sendToolResponse(response: LiveToolResponse): void {
    this.responses.push(response)
    this.flushResponses()
  }

  private emit(event: LiveEvent): void {
    if (event.type === 'connection') this.connectionState = event.state
    for (const listener of this.listeners) listener(event)
  }

  private isCurrent(lifecycleId: number): boolean {
    return this.active && lifecycleId === this.lifecycleId
  }

  private reportConnectionError(error: unknown): void {
    const message = error instanceof Error ? error.message
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message : String(error)
    this.lastConnectionError = message || 'Live connection failed.'
    this.emit({ type: 'error', message: this.lastConnectionError })
  }

  private async open(handle: string | undefined, lifecycleId: number): Promise<void> {
    const context = this.context
    const ai = this.ai
    if (!ai || !this.isCurrent(lifecycleId)) return
    const id = ++this.connectionId
    this.lastConnectionError = undefined
    const config: LiveConnectConfig = {
      ...buildLiveConfig(context, handle, context?.language ?? this.warmLanguage ?? 'en'),
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS.map((declaration) => ({
        ...declaration, behavior: Behavior.NON_BLOCKING,
      })) }],
    }
    const session = await ai.live.connect({
      model: 'gemini-3.8-live', config,
      callbacks: {
        onmessage: (message) => { if (id === this.connectionId) this.onMessage(message) },
        onerror: (error) => {
          if (id === this.connectionId) this.reportConnectionError(error)
        },
        onclose: (event) => {
          if (id === this.connectionId && this.active) {
            if (!this.lastConnectionError) this.reportConnectionError(
              `Live socket closed (${event?.code ?? 'unknown'}${event?.reason ? `: ${event.reason}` : ''}).`,
            )
            void this.beginRecovery()
          }
        },
      },
    })
    if (!this.isCurrent(lifecycleId) || id !== this.connectionId) { session.close(); return }
    this.session?.close()
    this.session = session
    this.awaitingTurn = false
    this.modelSpeaking = false
    clearTimeout(this.checkTimer)
    this.activeCheckId = undefined
    this.emit({ type: 'connection', state: 'connected', resumed: Boolean(handle) })
    this.flushResponses()
    if (this.latestFrame) session.sendRealtimeInput({ video: { data: this.latestFrame, mimeType: 'image/jpeg' } })
    for (const chunk of this.audio.splice(0)) this.sendAudio(chunk)
    this.flushTurns()
  }

  private async beginRecovery(): Promise<void> {
    const lifecycleId = this.lifecycleId
    if (this.recovery?.lifecycleId === lifecycleId || !this.isCurrent(lifecycleId)) return
    const old = this.session
    this.session = undefined
    this.connectionId += 1
    old?.close()
    this.awaitingTurn = false
    this.modelSpeaking = false
    clearTimeout(this.checkTimer)
    this.activeCheckId = undefined
    this.emit({ type: 'connection', state: 'reconnecting' })
    const promise = this.recover(Boolean(this.handle), lifecycleId)
    this.recovery = { lifecycleId, promise }
    try { await promise }
    finally { if (this.recovery?.promise === promise) this.recovery = undefined }
  }

  private async recover(tryResume: boolean, lifecycleId: number): Promise<void> {
    for (const delay of BACKOFF_MS) {
      if (!this.isCurrent(lifecycleId)) return
      await new Promise((resolve) => setTimeout(resolve, delay))
      if (!this.isCurrent(lifecycleId)) return
      try {
        await this.open(tryResume ? this.handle : undefined, lifecycleId)
        if (this.isCurrent(lifecycleId) && this.session) return
      } catch (error) {
        this.reportConnectionError(error)
        // Retry with the same resumption handle after a transient connection failure.
      }
    }
    if (tryResume && this.isCurrent(lifecycleId)) {
      try {
        await this.open(undefined, lifecycleId)
        if (this.isCurrent(lifecycleId) && this.session && this.context) {
          this.sendTurn(contextRestoreTurn(this.context, this.context.state ?? 'FOCUSED'))
          return
        }
      } catch (error) { this.reportConnectionError(error) }
    }
    if (this.isCurrent(lifecycleId)) {
      if (!this.lastConnectionError) this.reportConnectionError('Live connection failed without a server reason.')
      this.emit({ type: 'connection', state: 'degraded' })
    }
  }

  private onMessage(message: LiveServerMessage): void {
    const update = message.sessionResumptionUpdate
    if (update?.resumable && update.newHandle) {
      this.handle = update.newHandle
      this.emit({ type: 'resumption-handle', receivedAt: Date.now() })
    }
    if (message.goAway) { void this.beginRecovery(); return }
    for (const call of message.toolCall?.functionCalls ?? []) {
      if (call.id && call.name) this.emit({ type: 'tool-call', call: { id: call.id, name: call.name, args: call.args ?? {} } })
    }
    const content = message.serverContent
    if (!content) return
    if (content.inputTranscription?.text?.trim()) {
      this.emit({ type: 'user-transcription', text: content.inputTranscription.text })
    }
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) {
        this.modelSpeaking = true
        if (!this.checkingSilently) this.emit({ type: 'audio', pcm24Base64: part.inlineData.data })
      }
    }
    if (content.outputTranscription?.text && !this.checkingSilently) this.emit({ type: 'transcription', text: content.outputTranscription.text })
    if (content.interrupted) this.emit({ type: 'interrupted' })
    if (content.interrupted || content.turnComplete || content.generationComplete) {
      this.modelSpeaking = false
      this.emit({ type: 'generation-complete' })
    }
    // generationComplete can precede turnComplete while playback finishes.
    if (content.interrupted || content.turnComplete) {
      const checkId = this.activeCheckId
      clearTimeout(this.checkTimer)
      this.activeCheckId = undefined
      this.awaitingTurn = false
      // A completed CHECK without report_status must not latch drift detection forever.
      if (checkId) this.emit({ type: 'check-complete', checkId })
      this.flushTurns()
    }
  }

  private flushTurns(): void {
    while (this.session && this.turns.length > 0) {
      const next = this.turns[0]
      // The first capture after this request replaces any stale picture of the previous tab.
      if (next?.checkId && !this.frameForCheck) return
      // A nudge may be queued behind a silent [CHECK] as check-in opens. Deliver that
      // requested prompt once the prior turn ends; ordinary checks remain gated.
      if (!next || (next.turnComplete && (
        this.modelSpeaking || this.awaitingTurn || (this.checkinActive && next.tag !== 'NUDGE')
      ))) return
      this.turns.shift()
      if (next.turnComplete) { this.activeCheckId = next.checkId; this.checkingSilently = next.tag === 'CHECK' }
      try {
        const parts: Part[] = [{ text: next.text }]
        // Bind the image to this CHECK: separate media/text streams have no ordering guarantee.
        if (next.checkId && this.frameForCheck) parts.push({ inlineData: { data: this.frameForCheck, mimeType: 'image/jpeg' } })
        this.session.sendClientContent({ turns: [{ role: 'user', parts }], turnComplete: next.turnComplete })
        if (next.checkId) this.frameForCheck = undefined
      } catch {
        this.turns.unshift(next)
        void this.beginRecovery()
        return
      }
      if (next.turnComplete) {
        this.awaitingTurn = true
        if (next.checkId) this.checkTimer = setTimeout(() => {
          if (this.activeCheckId === next.checkId) void this.beginRecovery()
        }, DEFAULTS.checkTimeoutMs)
        this.checkTimer?.unref()
        return
      }
    }
  }

  private flushResponses(): void {
    while (this.session && this.responses.length > 0) {
      const next = this.responses.shift()
      if (!next) return
      try {
        this.session.sendToolResponse({ functionResponses: [{
          id: next.id, name: next.name, response: next.response,
          scheduling: next.scheduling === 'silent' ? FunctionResponseScheduling.SILENT : FunctionResponseScheduling.WHEN_IDLE,
        }] })
      } catch {
        this.responses.unshift(next)
        void this.beginRecovery()
        return
      }
    }
  }
}
