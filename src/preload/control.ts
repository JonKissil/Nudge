import { contextBridge, ipcRenderer } from 'electron'
import type { ControlApi } from '../shared/bridge'
import { EmptySchema, IPC, IpcSchemas } from '../shared/ipc'
import { SessionSnapshotSchema } from '../shared/types'
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
  setCaptureRunning: (running) => invokeAction(IPC.captureSet, { running }),
}
contextBridge.exposeInMainWorld('nudge', api)
