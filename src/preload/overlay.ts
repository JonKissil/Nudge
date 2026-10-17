import { contextBridge } from 'electron'
import type { OverlayApi } from '../shared/bridge'
import { IPC, IpcSchemas } from '../shared/ipc'
import { send, subscribe } from './index'

const api: OverlayApi = {
  kind: 'overlay',
  onState: (listener) => {
    const unsubscribe = subscribe(IPC.overlayState, IpcSchemas[IPC.overlayState], listener)
    send(IPC.overlayReady, {})
    return unsubscribe
  },
  action: (action) => send(IPC.overlayAction, action),
  setInteractive: (interactive) => send(IPC.overlayHover, { interactive }),
}
contextBridge.exposeInMainWorld('nudge', api)
