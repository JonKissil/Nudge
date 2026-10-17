import { z } from 'zod'
import {
  OverlayActionSchema, OverlayStateSchema, SessionSnapshotSchema, SessionStartSchema, SettingsSchema,
} from './types'

export const IPC = {
  frame: 'frame', frameFull: 'frame:full', micChunk: 'mic:chunk', micSet: 'mic:set',
  audioPlay: 'audio:play', audioFlush: 'audio:flush', frameRequestFull: 'frame:request-full',
  captureSet: 'capture:set', overlayState: 'overlay:state', overlayAction: 'overlay:action',
  overlayHover: 'overlay:hover', sessionStart: 'session:start', sessionLockWindow: 'session:lock-window',
  sessionEnd: 'session:end', sessionSnapshot: 'session:snapshot', settingsSet: 'settings:set',
} as const

export const EmptySchema = z.strictObject({})
const dimensions = { width: z.number().int().positive(), height: z.number().int().positive() }
const base64 = z.string().min(1).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u)

export const IpcSchemas = {
  [IPC.frame]: z.strictObject({ jpegBase64: base64, ...dimensions, ts: z.number().nonnegative() }),
  [IPC.frameFull]: z.strictObject({ pngBase64: base64, ...dimensions }),
  [IPC.micChunk]: z.strictObject({ pcm16Base64: base64 }),
  [IPC.micSet]: z.strictObject({ open: z.boolean() }),
  [IPC.audioPlay]: z.strictObject({ pcm24Base64: base64 }),
  [IPC.audioFlush]: EmptySchema,
  [IPC.frameRequestFull]: EmptySchema,
  [IPC.captureSet]: z.strictObject({ running: z.boolean() }),
  [IPC.overlayState]: OverlayStateSchema,
  [IPC.overlayAction]: OverlayActionSchema,
  [IPC.overlayHover]: z.strictObject({ interactive: z.boolean() }),
  [IPC.sessionStart]: SessionStartSchema,
  [IPC.sessionLockWindow]: EmptySchema,
  [IPC.sessionEnd]: EmptySchema,
  [IPC.sessionSnapshot]: SessionSnapshotSchema,
  [IPC.settingsSet]: SettingsSchema.partial(),
}
export type IpcChannel = keyof typeof IpcSchemas
export type IpcPayload<C extends IpcChannel> = z.infer<(typeof IpcSchemas)[C]>
