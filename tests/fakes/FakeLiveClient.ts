import type {
  LiveClient, LiveEvent, LiveSessionContext, LiveToolResponse, LiveTurn,
} from '../../src/main/gemini/types'
import type { LanguageCode } from '../../src/shared/languages'
import type { PrivacyState } from '../../src/shared/privacy'

/** Scriptable transport for session tests. It has no network or timing of its own. */
export class FakeLiveClient implements LiveClient {
  privacy?: PrivacyState
  setPrivacy(state: PrivacyState): void { this.privacy = state }
  readonly connections: LiveSessionContext[] = []
  readonly warmups: LanguageCode[] = []
  readonly turns: LiveTurn[] = []
  readonly frames: string[] = []
  readonly audioChunks: string[] = []
  readonly toolResponses: LiveToolResponse[] = []
  audioStreamEnds = 0
  disconnects = 0
  checkinActive = false
  context?: LiveSessionContext
  private readonly listeners = new Set<(event: LiveEvent) => void>()

  async warmup(language: LanguageCode = 'en'): Promise<void> {
    this.warmups.push(language)
    this.emit({ type: 'connection', state: 'connected', resumed: false })
  }

  async connect(context: LiveSessionContext): Promise<void> {
    this.connections.push(context)
    this.context = context
    this.emit({ type: 'connection', state: 'connected', resumed: false })
  }

  async disconnect(): Promise<void> {
    this.disconnects += 1
    this.emit({ type: 'connection', state: 'disconnected' })
  }

  onEvent(listener: (event: LiveEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  updateContext(context: LiveSessionContext): void { this.context = context }
  setCheckinActive(active: boolean): void { this.checkinActive = active }

  sendTurn(turn: LiveTurn): void { this.turns.push(turn) }
  trySendHabitReview(turn: LiveTurn): boolean { this.turns.push(turn); return true }
  sendFrame(jpegBase64: string): void { this.frames.push(jpegBase64) }
  sendAudio(pcm16Base64: string): void { this.audioChunks.push(pcm16Base64) }
  endAudioStream(): void { this.audioStreamEnds += 1 }
  sendToolResponse(response: LiveToolResponse): void { this.toolResponses.push(response) }

  emit(event: LiveEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  script(events: readonly LiveEvent[]): void {
    for (const event of events) this.emit(event)
  }
}
