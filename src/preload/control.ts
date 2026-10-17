import { contextBridge, ipcRenderer } from 'electron'
import type { ControlApi } from '../shared/bridge'
import { EmptySchema, IPC, IpcSchemas } from '../shared/ipc'
import { PermissionStatusSchema, SessionSnapshotSchema } from '../shared/types'
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
  setSettings: (settings) => invokeAction(IPC.settingsSet, settings),
<<<<<<< Updated upstream
<<<<<<< HEAD
  previewOverlay: (action) => invokeAction(IPC.overlayPreview, { action }),
=======
>>>>>>> f5bb2fc (Scaffold)
=======
  getPermissionStatus: async () => {
    const result: unknown = await ipcRenderer.invoke(IPC.permissionsStatus, EmptySchema.parse({}))
    return PermissionStatusSchema.parse(result)
  },
  openPermissionSettings: (kind) => invokeAction(IPC.permissionsOpen, { kind }),
  previewOverlay: (action) => invokeAction(IPC.overlayPreview, { action }),
  setCaptureRunning: (running) => invokeAction(IPC.captureSet, { running }),
>>>>>>> Stashed changes
}
contextBridge.exposeInMainWorld('nudge', api)
