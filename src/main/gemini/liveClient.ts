import {
  Behavior, FunctionResponseScheduling, GoogleGenAI, MediaResolution, Modality,
} from '@google/genai'
import type { LiveConnectConfig, LiveServerMessage, Session } from '@google/genai'
import { buildLiveConfig } from './config'
import { LiveQueue } from './liveQueue'
import { connectWithin, LiveTiming } from './liveTiming'
import { contextRestoreTurn } from './prompts'
import { TOOL_DECLARATIONS } from './tools'
import type {
  LiveClient, LiveEvent, LiveSessionContext, LiveToolResponse, LiveTurn,
} from './types'

const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 4_000] as const
const CONNECT_TIMEOUT_MS = 10_000
const TURN_TIMEOUT_MS = 30_000

export class GeminiLiveClient implements LiveClient {
  private ai?: GoogleGenAI
  private session?: Session
  private context?: LiveSessionContext
  private readonly listeners = new Set<(event: LiveEvent) => void>()
  private readonly queue = new LiveQueue()
  private readonly timing = new LiveTiming()
  private latestFrame?: string
  private handle?: string
  private sessionEpoch = 0
  private active = false
  private lifecycleId = 0
  private connectionId = 0
  private recovery?: { lifecycleId: number; promise: Promise<void> }
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
    const lifecycleId = ++this.lifecycleId
    this.context = context
    this.active = true
    this.handle = undefined
    this.timing.resetCycles()
    this.emit({ type: 'connection', state: 'reconnecting' })
    if (!this.apiKey) {
      this.emit({ type: 'error', message: 'GEMINI_API_KEY is missing.' })
      this.emit({ type: 'connection', state: 'degraded' })
      return
    }
    this.ai = new GoogleGenAI({ apiKey: this.apiKey, httpOptions: { apiVersion: 'v1beta' } })
    try {
      await this.open(undefined, lifecycleId, false)
    } catch {
      await this.recover(false, lifecycleId, false)
    }
  }

  async disconnect(): Promise<void> {
    this.active = false
    this.lifecycleId += 1
    this.connectionId += 1
    this.timing.clear()
    try { this.session?.close() }
    catch { /* The transport is already unusable; finish local cleanup. */ }
    this.session = undefined
    this.context = undefined
    this.handle = undefined
    this.queue.clear()
    this.latestFrame = undefined
    this.awaitingTurn = false
    this.modelSpeaking = false
    this.checkinActive = false
    this.recovery = undefined
    this.emit({ type: 'connection', state: 'disconnected' })
  }

  sendTurn(turn: LiveTurn): void {
    if (!this.active) return
    this.queue.addTurn(turn)
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
    if (!this.session) return // Old microphone audio is not useful after a handoff.
    try { this.session.sendRealtimeInput({ audio: { data: pcm16Base64, mimeType: 'audio/pcm;rate=16000' } }) }
    catch { void this.beginRecovery() }
  }

  endAudioStream(): void {
    try { this.session?.sendRealtimeInput({ audioStreamEnd: true }) }
    catch { void this.beginRecovery() }
  }

  sendToolResponse(response: LiveToolResponse): void {
    if (!this.active || (response.sessionEpoch !== undefined && response.sessionEpoch !== this.sessionEpoch)) return
    this.queue.addResponse(response, this.sessionEpoch)
    this.flushResponses()
  }

  private emit(event: LiveEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private isCurrent(lifecycleId: number): boolean {
    return this.active && lifecycleId === this.lifecycleId
  }

  private async open(handle: string | undefined, lifecycleId: number, restore: boolean): Promise<void> {
    const context = this.context
    const ai = this.ai
    if (!context || !ai || !this.isCurrent(lifecycleId)) return
    const id = ++this.connectionId
    const config: LiveConnectConfig = {
      ...buildLiveConfig(context, handle),
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS.map((declaration) => ({
        ...declaration, behavior: Behavior.NON_BLOCKING,
      })) }],
    }
    const connecting = ai.live.connect({
      model: 'gemini-3.8-live', config,
      callbacks: {
        onmessage: (message) => { if (id === this.connectionId) this.onMessage(message) },
        onerror: (error) => {
          if (id !== this.connectionId) return
          this.emit({ type: 'error', message: error.message || 'Live connection error.' })
          if (this.session) void this.beginRecovery()
        },
        onclose: () => {
          if (id === this.connectionId && this.active && this.session) void this.beginRecovery()
        },
      },
    })
    let session: Session
    try {
      session = await connectWithin(connecting, CONNECT_TIMEOUT_MS,
        () => this.isCurrent(lifecycleId) && id === this.connectionId,
        () => { if (id === this.connectionId) this.connectionId += 1 },
        (late) => late.close())
    } catch (error) {
      if (id === this.connectionId) this.connectionId += 1
      throw error
    }
    if (!this.isCurrent(lifecycleId) || id !== this.connectionId) { session.close(); return }
    const freshRestore = restore && !handle
    if (freshRestore) {
      const current = this.context ?? context
      const turn = contextRestoreTurn(current, current.state ?? 'FOCUSED')
      try {
        session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: turn.text }] }], turnComplete: false })
      } catch (error) { session.close(); throw error }
      this.queue.prepareFresh(current.state)
    }
    this.session?.close()
    this.session = session
    if (!handle) {
      this.handle = undefined
      this.sessionEpoch += 1
      this.awaitingTurn = false
      if (freshRestore) this.emit({ type: 'resumption-handle', receivedAt: null })
    }
    this.modelSpeaking = false
    this.timing.resetCycles()
    this.timing.clearRetry()
    this.emit({ type: 'connection', state: 'connected', resumed: Boolean(handle), restored: freshRestore })
    if (this.awaitingTurn) this.watchTurn()
    this.flushResponses()
    if (this.latestFrame) {
      const frame = this.latestFrame
      this.latestFrame = undefined
      this.sendFrame(frame)
    }
    this.flushTurns()
  }

  private async beginRecovery(): Promise<void> {
    const lifecycleId = this.lifecycleId
    if (this.recovery?.lifecycleId === lifecycleId || !this.isCurrent(lifecycleId)) return
    const old = this.session
    this.session = undefined
    this.connectionId += 1
    this.timing.clear()
    try { old?.close() }
    catch { /* Recovery must continue even if the old socket cannot close cleanly. */ }
    this.modelSpeaking = false
    this.emit({ type: 'connection', state: 'reconnecting' })
    const promise = this.recover(Boolean(this.handle), lifecycleId, true)
    this.recovery = { lifecycleId, promise }
    try { await promise }
    finally { if (this.recovery?.promise === promise) this.recovery = undefined }
  }

  private async recover(tryResume: boolean, lifecycleId: number, restore: boolean): Promise<void> {
    for (const delay of BACKOFF_MS) {
      if (!this.isCurrent(lifecycleId)) return
      await new Promise((resolve) => setTimeout(resolve, delay))
      if (!this.isCurrent(lifecycleId)) return
      try {
        await this.open(tryResume ? this.handle : undefined, lifecycleId, restore)
        if (this.isCurrent(lifecycleId) && this.session) return
      } catch {
        // Retry with the same resumption handle after a transient connection failure.
      }
    }
    if (tryResume && this.isCurrent(lifecycleId)) {
      try {
        await this.open(undefined, lifecycleId, restore)
        if (this.isCurrent(lifecycleId) && this.session) return
      } catch { /* degraded mode below */ }
    }
    if (this.isCurrent(lifecycleId)) {
      this.emit({ type: 'connection', state: 'degraded' })
      if (this.apiKey) this.timing.retryWhileActive(
        () => this.isCurrent(lifecycleId), () => { void this.beginRecovery() })
    }
  }

  private watchTurn(): void {
    this.timing.watchTurn(TURN_TIMEOUT_MS, () => Boolean(this.session && this.awaitingTurn), () => {
      this.emit({ type: 'error', message: 'Live response timed out.' })
      void this.beginRecovery()
    })
  }

  private onMessage(message: LiveServerMessage): void {
    const update = message.sessionResumptionUpdate
    if (update?.resumable && update.newHandle) {
      this.handle = update.newHandle
      this.emit({ type: 'resumption-handle', receivedAt: Date.now() })
    } else if (update?.resumable === false) {
      // An older handle can omit in-flight calls or generation state.
      this.handle = undefined
      this.emit({ type: 'resumption-handle', receivedAt: null })
    }
    if (message.goAway) { void this.beginRecovery(); return }
    for (const call of message.toolCall?.functionCalls ?? []) {
      if (call.id && call.name) this.emit({
        type: 'tool-call', call: { id: call.id, name: call.name, args: call.args ?? {} },
        sessionEpoch: this.sessionEpoch,
      })
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
      this.timing.clearTurn()
      this.flushTurns()
    }
  }

  private flushTurns(): void {
    while (this.session) {
      const next = this.queue.firstTurn()
      // A nudge may be queued behind a silent [CHECK] as check-in opens. Deliver that
      // requested prompt once the prior turn ends; ordinary checks remain gated.
      if (!next || (next.turnComplete && (
        this.modelSpeaking || this.awaitingTurn || (this.checkinActive && next.tag !== 'NUDGE')
      ))) return
      try {
        this.session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: next.text }] }], turnComplete: next.turnComplete })
      } catch {
        void this.beginRecovery()
        return
      }
      this.queue.shiftTurn()
      if (next.turnComplete) {
        this.awaitingTurn = true
        this.watchTurn()
        return
      }
    }
  }

  private flushResponses(): void {
    while (this.session) {
      const next = this.queue.firstResponse(this.sessionEpoch)
      if (!next) return
      try {
        this.session.sendToolResponse({ functionResponses: [{
          id: next.id, name: next.name, response: next.response,
          scheduling: next.scheduling === 'silent' ? FunctionResponseScheduling.SILENT : FunctionResponseScheduling.WHEN_IDLE,
        }] })
      } catch {
        void this.beginRecovery()
        return
      }
      this.queue.shiftResponse()
    }
  }
}
