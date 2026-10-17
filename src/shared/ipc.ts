import { z } from 'zod'
import { isBase64 } from './base64'
import {
  CaptureStatusSchema, MicTestResultSchema, OverlayActionSchema, OverlayStateSchema, SessionSnapshotSchema,
  SessionStartSchema, SettingsSchema,
} from './types'

export const IPC = {
  frame: 'frame', frameFull: 'frame:full', micChunk: 'mic:chunk', micSet: 'mic:set',
  audioPlay: 'audio:play', audioFlush: 'audio:flush', audioReset: 'audio:reset',
  audioChime: 'audio:chime', frameRequestFull: 'frame:request-full',
  captureSet: 'capture:set', overlayState: 'overlay:state', overlayAction: 'overlay:action',
  overlayHover: 'overlay:hover', sessionStart: 'session:start', sessionLockWindow: 'session:lock-window',
  overlayPreview: 'overlay:preview', overlayReady: 'overlay:ready',
  sessionEnd: 'session:end', sessionSnapshot: 'session:snapshot', settingsSet: 'settings:set',
  sessionPauseToggle: 'session:pause-toggle',
  permissionsStatus: 'permissions:status', permissionsOpen: 'permissions:open',
  permissionsRequestMicrophone: 'permissions:request-microphone',
  micTest: 'mic:test', micTestStart: 'mic:test-start', micTestResult: 'mic:test-result',
  mediaReady: 'media:ready', captureStatus: 'capture:status',
} as const

export const EmptySchema = z.strictObject({})
const dimensions = { width: z.number().int().positive(), height: z.number().int().positive() }
const base64 = z.string().refine(isBase64, 'Expected valid base64')

export const IpcSchemas = {
  [IPC.frame]: z.strictObject({ jpegBase64: base64, ...dimensions, ts: z.number().nonnegative() }),
  [IPC.frameFull]: z.strictObject({ pngBase64: base64, ...dimensions }),
  [IPC.micChunk]: z.strictObject({ pcm16Base64: base64 }),
  [IPC.micSet]: z.strictObject({ open: z.boolean() }),
  [IPC.audioPlay]: z.strictObject({ pcm24Base64: base64 }),
  [IPC.audioFlush]: EmptySchema,
  [IPC.audioReset]: EmptySchema,
  [IPC.audioChime]: EmptySchema,
  [IPC.frameRequestFull]: EmptySchema,
  [IPC.captureSet]: z.strictObject({ running: z.boolean() }),
  [IPC.mediaReady]: EmptySchema,
  [IPC.captureStatus]: CaptureStatusSchema,
  [IPC.overlayState]: OverlayStateSchema,
  [IPC.overlayAction]: OverlayActionSchema,
  [IPC.overlayHover]: z.strictObject({ interactive: z.boolean() }),
  [IPC.overlayPreview]: z.strictObject({ action: z.enum(['next', 'hide']) }),
  [IPC.overlayReady]: EmptySchema,
  [IPC.sessionStart]: SessionStartSchema,
  [IPC.sessionLockWindow]: EmptySchema,
  [IPC.sessionEnd]: EmptySchema,
  [IPC.sessionPauseToggle]: EmptySchema,
  [IPC.sessionSnapshot]: SessionSnapshotSchema,
  [IPC.settingsSet]: SettingsSchema.partial(),
  [IPC.permissionsStatus]: EmptySchema,
  [IPC.permissionsOpen]: z.strictObject({ kind: z.enum(['screen', 'microphone', 'automation', 'accessibility']) }),
  [IPC.permissionsRequestMicrophone]: EmptySchema,
  [IPC.micTest]: EmptySchema,
  [IPC.micTestStart]: z.strictObject({ id: z.uuid() }),
  [IPC.micTestResult]: MicTestResultSchema,
}
export type IpcChannel = keyof typeof IpcSchemas
export type IpcPayload<C extends IpcChannel> = z.infer<(typeof IpcSchemas)[C]>
