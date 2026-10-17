import { contextBridge } from 'electron'
import type { OverlayApi } from '../shared/bridge'
import { IPC, IpcSchemas } from '../shared/ipc'
import { send, subscribe } from './index'

const api: OverlayApi = {
  kind: 'overlay',
  onState: (listener) => subscribe(IPC.overlayState, IpcSchemas[IPC.overlayState], listener),
  action: (action) => send(IPC.overlayAction, action),
  setInteractive: (interactive) => send(IPC.overlayHover, { interactive }),
}
contextBridge.exposeInMainWorld('nudge', api)
