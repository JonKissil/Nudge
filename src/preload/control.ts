import { contextBridge, ipcRenderer } from 'electron'
import type { ControlApi } from '../shared/bridge'
import { EmptySchema, IPC, IpcSchemas } from '../shared/ipc'
import { MicTestResultSchema, PermissionStatusSchema, SessionSnapshotSchema } from '../shared/types'
import { invokeAction, subscribe } from './index'

const api: ControlApi = {
  kind: 'control',
  getSnapshot: async () => {
    const result: unknown = await ipcRenderer.invoke(IPC.sessionSnapshot, EmptySchema.parse({}))
    return SessionSnapshotSchema.parse(result)
  },
  onSnapshot: (listener) => subscribe(IPC.sessionSnapshot, IpcSchemas[IPC.sessionSnapshot], listener),
  startSession: (input) => invokeAction(IPC.sessionStart, input),
  lockTaskWindow: () => invokeAction(IPC.sessionLockWindow, {}),
  endSession: () => invokeAction(IPC.sessionEnd, {}),
  togglePause: () => invokeAction(IPC.sessionPauseToggle, {}),
  setSettings: (settings) => invokeAction(IPC.settingsSet, settings),
  resetGraceHistory: () => invokeAction(IPC.graceReset, {}),
  recordTimingFeedback: (feedback) => invokeAction(IPC.graceFeedback, feedback),
  previewOverlay: (action) => invokeAction(IPC.overlayPreview, { action }),
  getPermissionStatus: async () => {
    const result: unknown = await ipcRenderer.invoke(IPC.permissionsStatus, EmptySchema.parse({}))
    return PermissionStatusSchema.parse(result)
  },
  openPermissionSettings: (kind) => invokeAction(IPC.permissionsOpen, { kind }),
  requestMicrophoneAccess: () => invokeAction(IPC.permissionsRequestMicrophone, {}),
  testMicrophone: async () => {
    const result: unknown = await ipcRenderer.invoke(IPC.micTest, EmptySchema.parse({}))
    return MicTestResultSchema.parse(result)
  },
}
contextBridge.exposeInMainWorld('nudge', api)
