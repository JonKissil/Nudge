import type { SessionState, WindowInfo } from '../../shared/types'
import type { LanguageCode } from '../../shared/languages'
import type { HabitProfile } from '../../shared/habits'

export interface LiveSessionContext {
  task: string
  minutes: number
  language: LanguageCode
  taskWindow: WindowInfo
  lastNextStep?: string
  state?: SessionState
  habitProfile?: HabitProfile
}

export type TurnTag =
  | 'SESSION_START' | 'CHECK' | 'NUDGE' | 'USER_RETURNED'
  | 'SNOOZE_OVER' | 'CONTEXT_RESTORE' | 'HABIT_REVIEW'

export interface LiveTurn {
  tag: TurnTag
  text: string
  turnComplete: boolean
  checkId?: string
  reviewId?: string
}

export interface LiveToolCall {
  id: string
  name: string
  args: unknown
}

export interface LiveToolResponse {
  id: string
  name: string
  response: Record<string, unknown>
  scheduling: 'silent' | 'when-idle'
}

export type LiveEvent =
  | { type: 'connection'; state: 'connected' | 'reconnecting' | 'degraded' | 'disconnected'; resumed?: boolean }
  | { type: 'resumption-handle'; receivedAt: number }
  | { type: 'tool-call'; call: LiveToolCall }
  | { type: 'audio'; pcm24Base64: string }
  | { type: 'transcription'; text: string }
  | { type: 'user-transcription'; text: string }
  | { type: 'generation-complete' }
  | { type: 'check-complete'; checkId: string }
  | { type: 'interrupted' }
  | { type: 'error'; message: string }

export interface LiveClient {
  warmup(language?: LanguageCode): Promise<void>
  connect(context: LiveSessionContext): Promise<void>
  disconnect(): Promise<void>
  onEvent(listener: (event: LiveEvent) => void): () => void
  updateContext(context: LiveSessionContext): void
  setCheckinActive(active: boolean): void
  sendTurn(turn: LiveTurn): void
  trySendHabitReview(turn: LiveTurn): boolean
  sendFrame(jpegBase64: string): void
  sendAudio(pcm16Base64: string): void
  endAudioStream(): void
  sendToolResponse(response: LiveToolResponse): void
}
