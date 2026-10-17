import type { IpcPayload, IPC } from './ipc'
import type { ActionResult, SessionSnapshot, SessionStart, Settings, OverlayAction, PermissionStatus } from './types'

type Unsubscribe = () => void
type Listen<C extends keyof IpcPayloadMap> = (listener: (payload: IpcPayloadMap[C]) => void) => Unsubscribe
type IpcPayloadMap = { [C in import('./ipc').IpcChannel]: IpcPayload<C> }

export interface ControlApi {
  kind: 'control'
  getSnapshot: () => Promise<SessionSnapshot>
  onSnapshot: Listen<typeof IPC.sessionSnapshot>
  startSession: (input: SessionStart) => Promise<ActionResult>
  lockTaskWindow: () => Promise<ActionResult>
  endSession: () => Promise<ActionResult>
  setSettings: (settings: Partial<Settings>) => Promise<ActionResult>
<<<<<<< HEAD
  previewOverlay: (action: 'next' | 'hide') => Promise<ActionResult>
<<<<<<< Updated upstream
=======
>>>>>>> f5bb2fc (Scaffold)
=======
  setCaptureRunning: (running: boolean) => Promise<ActionResult>
  getPermissionStatus: () => Promise<PermissionStatus>
  openPermissionSettings: (kind: 'screen' | 'microphone' | 'automation') => Promise<ActionResult>
>>>>>>> Stashed changes
}
export interface OverlayApi {
  kind: 'overlay'
  onState: Listen<typeof IPC.overlayState>
  action: (action: OverlayAction) => void
  setInteractive: (interactive: boolean) => void
}
export interface MediaApi {
  kind: 'media'
  sendFrame: (frame: IpcPayload<typeof IPC.frame>) => void
  sendFullFrame: (frame: IpcPayload<typeof IPC.frameFull>) => void
  sendMicChunk: (chunk: IpcPayload<typeof IPC.micChunk>) => void
  onMicSet: Listen<typeof IPC.micSet>
  onAudioPlay: Listen<typeof IPC.audioPlay>
  onAudioFlush: Listen<typeof IPC.audioFlush>
  onAudioChime: Listen<typeof IPC.audioChime>
  onFullFrameRequest: Listen<typeof IPC.frameRequestFull>
  onCaptureSet: Listen<typeof IPC.captureSet>
  sendCaptureStatus: (status: IpcPayload<typeof IPC.captureStatus>) => void
  ready: () => void
}
export type NudgeApi = ControlApi | OverlayApi | MediaApi
