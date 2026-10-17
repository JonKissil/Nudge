import type { SessionState, WindowInfo } from '../../shared/types'

export interface LiveSessionContext {
  task: string
  minutes: number
  taskWindow: WindowInfo
  lastNextStep?: string
  state?: SessionState
}

export type TurnTag =
  | 'SESSION_START' | 'CHECK' | 'NUDGE' | 'USER_RETURNED'
  | 'SNOOZE_OVER' | 'CONTEXT_RESTORE'

export interface LiveTurn {
  tag: TurnTag
  text: string
  turnComplete: boolean
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
  | { type: 'interrupted' }
  | { type: 'error'; message: string }

export interface LiveClient {
  connect(context: LiveSessionContext): Promise<void>
  disconnect(): Promise<void>
  onEvent(listener: (event: LiveEvent) => void): () => void
  updateContext(context: LiveSessionContext): void
  setCheckinActive(active: boolean): void
  sendTurn(turn: LiveTurn): void
  sendFrame(jpegBase64: string): void
  sendAudio(pcm16Base64: string): void
  endAudioStream(): void
  sendToolResponse(response: LiveToolResponse): void
}
