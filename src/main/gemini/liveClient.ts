import {
  Behavior, FunctionResponseScheduling, GoogleGenAI, MediaResolution, Modality,
} from '@google/genai'
import type { LiveConnectConfig, LiveServerMessage, Session } from '@google/genai'
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
  private connectionId = 0
  private recovery?: Promise<void>
  private awaitingTurn = false
  private modelSpeaking = false
  private checkinActive = false

  constructor(private readonly apiKey = process.env.GEMINI_API_KEY) {}

  onEvent(listener: (event: LiveEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  updateContext(context: LiveSessionContext): void { this.context = context }

  setCheckinActive(active: boolean): void {
    this.checkinActive = active
    if (!active) this.flushTurns()
  }

  async connect(context: LiveSessionContext): Promise<void> {
    if (this.active) throw new Error('A Live session is already active')
    this.context = context
    this.active = true
    this.handle = undefined
    this.emit({ type: 'connection', state: 'reconnecting' })
    if (!this.apiKey) {
      this.emit({ type: 'error', message: 'GEMINI_API_KEY is missing.' })
      this.emit({ type: 'connection', state: 'degraded' })
      return
    }
    this.ai = new GoogleGenAI({ apiKey: this.apiKey, httpOptions: { apiVersion: 'v1beta' } })
    try {
      await this.open(undefined)
    } catch {
      await this.recover(false)
    }
  }

  async disconnect(): Promise<void> {
    this.active = false
    this.connectionId += 1
    this.session?.close()
    this.session = undefined
    this.context = undefined
    this.handle = undefined
    this.turns.length = 0
    this.responses.length = 0
    this.audio.length = 0
    this.latestFrame = undefined
    this.awaitingTurn = false
    this.modelSpeaking = false
    this.checkinActive = false
    this.emit({ type: 'connection', state: 'disconnected' })
  }

  sendTurn(turn: LiveTurn): void {
    this.turns.push(turn)
    this.flushTurns()
  }

  sendFrame(jpegBase64: string): void {
    if (!this.session) { this.latestFrame = jpegBase64; return }
    try {
      this.session.sendRealtimeInput({ video: { data: jpegBase64, mimeType: 'image/jpeg' } })
    } catch {
      this.latestFrame = jpegBase64
      void this.beginRecovery()
    }
  }

  sendAudio(pcm16Base64: string): void {
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
    for (const listener of this.listeners) listener(event)
  }

  private async open(handle: string | undefined): Promise<void> {
    const context = this.context
    const ai = this.ai
    if (!context || !ai || !this.active) return
    const id = ++this.connectionId
    const config: LiveConnectConfig = {
      ...buildLiveConfig(context, handle),
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS.map((declaration) => ({
        ...declaration, behavior: Behavior.NON_BLOCKING,
      })) }],
    }
    const session = await ai.live.connect({
      model: 'gemini-3.8-live', config,
      callbacks: {
        onmessage: (message) => { if (id === this.connectionId) this.onMessage(message) },
        onerror: (error) => {
          if (id === this.connectionId) this.emit({ type: 'error', message: error.message || 'Live connection error.' })
        },
        onclose: () => {
          if (id === this.connectionId && this.active) void this.beginRecovery()
        },
      },
    })
    if (!this.active || id !== this.connectionId) { session.close(); return }
    this.session = session
    this.awaitingTurn = false
    this.modelSpeaking = false
    this.emit({ type: 'connection', state: 'connected', resumed: Boolean(handle) })
    this.flushResponses()
    if (this.latestFrame) { this.sendFrame(this.latestFrame); this.latestFrame = undefined }
    for (const chunk of this.audio.splice(0)) this.sendAudio(chunk)
    this.flushTurns()
  }

  private async beginRecovery(): Promise<void> {
    if (this.recovery || !this.active) return
    const old = this.session
    this.session = undefined
    this.connectionId += 1
    old?.close()
    this.awaitingTurn = false
    this.modelSpeaking = false
    this.emit({ type: 'connection', state: 'reconnecting' })
    this.recovery = this.recover(Boolean(this.handle)).finally(() => { this.recovery = undefined })
    await this.recovery
  }

  private async recover(tryResume: boolean): Promise<void> {
    for (const delay of BACKOFF_MS) {
      if (!this.active) return
      await new Promise((resolve) => setTimeout(resolve, delay))
      if (!this.active) return
      try {
        await this.open(tryResume ? this.handle : undefined)
        if (this.session) return
      } catch {
        // Retry with the same resumption handle after a transient connection failure.
      }
    }
    if (tryResume && this.active) {
      try {
        await this.open(undefined)
        if (this.session && this.context) {
          this.sendTurn(contextRestoreTurn(this.context, this.context.state ?? 'FOCUSED'))
          return
        }
      } catch { /* degraded mode below */ }
    }
    if (this.active) this.emit({ type: 'connection', state: 'degraded' })
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
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) {
        this.modelSpeaking = true
        this.emit({ type: 'audio', pcm24Base64: part.inlineData.data })
      }
    }
    if (content.outputTranscription?.text) this.emit({ type: 'transcription', text: content.outputTranscription.text })
    if (content.inputTranscription?.text?.trim()) {
      this.emit({ type: 'user-transcription', text: content.inputTranscription.text })
    }
    if (content.interrupted) this.emit({ type: 'interrupted' })
    if (content.interrupted || content.turnComplete || content.generationComplete) {
      this.modelSpeaking = false
      this.emit({ type: 'generation-complete' })
    }
    // generationComplete can precede turnComplete while playback finishes.
    if (content.interrupted || content.turnComplete) {
      this.awaitingTurn = false
      this.flushTurns()
    }
  }

  private flushTurns(): void {
    while (this.session && this.turns.length > 0) {
      const next = this.turns[0]
      // A nudge may be queued behind a silent [CHECK] as check-in opens. Deliver that
      // requested prompt once the prior turn ends; ordinary checks remain gated.
      if (!next || (next.turnComplete && (
        this.modelSpeaking || this.awaitingTurn || (this.checkinActive && next.tag !== 'NUDGE')
      ))) return
      this.turns.shift()
      try {
        this.session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: next.text }] }], turnComplete: next.turnComplete })
      } catch {
        this.turns.unshift(next)
        void this.beginRecovery()
        return
      }
      if (next.turnComplete) { this.awaitingTurn = true; return }
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
