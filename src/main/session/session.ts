import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { DEMO_TASK } from '../../shared/config'
import { EmptySchema, IPC, IpcSchemas, type IpcChannel } from '../../shared/ipc'
import { ActionResultSchema, OverlayStateSchema, SessionSnapshotSchema } from '../../shared/types'
import type { ActionResult, SessionSnapshot } from '../../shared/types'
import type { AppWindows } from '../windows'

// M0 only stores setup data. The reducer, timers, and Live connection arrive in M3/M4.
export function registerScaffoldIpc(getWindows: () => AppWindows | undefined): void {
  const demoMode = process.env.DEMO_MODE === '1'
  let snapshot: SessionSnapshot = SessionSnapshotSchema.parse({
    state: 'IDLE', conn: 'disconnected', task: demoMode ? DEMO_TASK : '', minutes: 30,
    settings: { demoMode, showHud: demoMode },
    stats: { framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [] },
  })

  const isSender = (sender: Electron.WebContents, kind: keyof AppWindows): boolean =>
    getWindows()?.[kind].webContents === sender

  const publish = (): void => {
    const windows = getWindows()
    if (!windows) return
    windows.control.webContents.send(IPC.sessionSnapshot, SessionSnapshotSchema.parse(snapshot))
    windows.overlay.webContents.send(IPC.overlayState, OverlayStateSchema.parse({
      pill: { state: snapshot.state, offline: false }, notes: [],
    }))
  }

  const handle = <T>(channel: IpcChannel, schema: z.ZodType<T>, action: (payload: T) => ActionResult): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, payload: unknown) => {
      if (!isSender(event.sender, 'control') || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, error: 'This command is only available in the control window.' }
      }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return { ok: false, error: 'Invalid command payload.' }
      try {
        const result = ActionResultSchema.parse(action(parsed.data))
        publish()
        return result
      } catch {
        console.error(`Scaffold command failed: ${channel}`)
        return { ok: false, error: 'The command could not be completed.' }
      }
    })
  }

  ipcMain.handle(IPC.sessionSnapshot, (event, payload: unknown) => {
    if (!isSender(event.sender, 'control') || event.senderFrame !== event.sender.mainFrame
      || !EmptySchema.safeParse(payload).success) throw new Error('Invalid snapshot request')
    return SessionSnapshotSchema.parse(snapshot)
  })
  handle(IPC.sessionStart, IpcSchemas[IPC.sessionStart], (input) => {
    if (snapshot.state !== 'IDLE' && snapshot.state !== 'ENDED' && snapshot.state !== 'SETUP') {
      return { ok: false, error: 'End the current session before starting another.' }
    }
    snapshot = { ...snapshot, ...input, state: 'SETUP' }
    return { ok: true }
  })
  handle(IPC.sessionEnd, EmptySchema, () => {
    snapshot = { ...snapshot, state: 'ENDED' }
    return { ok: true }
  })
  handle(IPC.sessionLockWindow, EmptySchema, () => ({
    ok: false, error: 'Task window locking is scheduled for M2.',
  }))
  handle(IPC.settingsSet, IpcSchemas[IPC.settingsSet], (settings) => {
    snapshot = { ...snapshot, settings: { ...snapshot.settings, ...settings } }
    return { ok: true }
  })

  // Validate all incoming event channels, even while their consumers are scaffold placeholders.
  for (const channel of [IPC.frame, IPC.frameFull, IPC.micChunk, IPC.overlayAction, IPC.overlayHover]) {
    ipcMain.on(channel, (event, payload: unknown) => {
      const kind = channel === IPC.overlayAction || channel === IPC.overlayHover ? 'overlay' : 'media'
      if (!isSender(event.sender, kind) || event.senderFrame !== event.sender.mainFrame) return
      const parsed = IpcSchemas[channel].safeParse(payload)
      if (!parsed.success) { console.error(`Invalid IPC payload: ${channel}`); return }
      if (channel === IPC.overlayHover) {
        const { interactive } = IpcSchemas[IPC.overlayHover].parse(parsed.data)
        getWindows()?.overlay.setIgnoreMouseEvents(!interactive, { forward: true })
      }
    })
  }
}
