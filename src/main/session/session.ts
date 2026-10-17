import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { DEMO_TASK } from '../../shared/config'
import { EmptySchema, IPC, IpcSchemas, type IpcChannel } from '../../shared/ipc'
import { ActionResultSchema, OverlayStateSchema, SessionSnapshotSchema } from '../../shared/types'
import type { ActionResult, OverlayAction, OverlayPreview, OverlayState, SessionSnapshot } from '../../shared/types'
import type { AppWindows } from '../windows'
import { applyPreviewAction, createOverlayPreview, OVERLAY_PREVIEWS } from './overlayPreview'

// Setup and overlay previews only. The study reducer and Live connection arrive in M3/M4.
export function registerScaffoldIpc(getWindows: () => AppWindows | undefined): void {
  const demoMode = process.env.DEMO_MODE === '1'
  let snapshot: SessionSnapshot = SessionSnapshotSchema.parse({
    state: 'IDLE', conn: 'disconnected', task: demoMode ? DEMO_TASK : '', minutes: 30, overlayPreview: 'hidden',
    settings: { demoMode, showHud: demoMode },
    stats: { framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [] },
  })
  let overlay: OverlayState = createOverlayPreview('hidden', Date.now())
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  app.once('before-quit', () => { clearTimeout(expiryTimer) })

  const isSender = (sender: Electron.WebContents, kind: keyof AppWindows): boolean =>
    getWindows()?.[kind].webContents === sender

  const publish = (): void => {
    const windows = getWindows()
    if (!windows) return
    windows.control.webContents.send(IPC.sessionSnapshot, SessionSnapshotSchema.parse(snapshot))
    // A removed/expired button must never leave the full-display window intercepting clicks.
    windows.overlay.setIgnoreMouseEvents(true, { forward: true })
    windows.overlay.webContents.send(IPC.overlayState, OverlayStateSchema.parse(overlay))
    clearTimeout(expiryTimer)
    const deadlines = overlay.notes.map((note) => note.expiresAt)
    if (overlay.pill.snoozeUntil !== undefined) deadlines.push(overlay.pill.snoozeUntil)
    if (deadlines.length) expiryTimer = setTimeout(() => {
      const now = Date.now()
      overlay = { ...overlay, notes: overlay.notes.filter((note) => note.expiresAt > now) }
      if (overlay.pill.snoozeUntil !== undefined && overlay.pill.snoozeUntil <= now) {
        overlay = { ...overlay, pill: { state: 'FOCUSED', offline: overlay.pill.offline } }
        if (snapshot.overlayPreview === 'snoozed') snapshot = { ...snapshot, overlayPreview: 'focused' }
      }
      publish()
    }, Math.max(0, Math.min(...deadlines) - Date.now()))
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
  handle(IPC.overlayPreview, IpcSchemas[IPC.overlayPreview], ({ action }) => {
    if (app.isPackaged) return { ok: false, error: 'Overlay previews are available in development builds.' }
    const index = OVERLAY_PREVIEWS.indexOf(snapshot.overlayPreview ?? 'hidden')
    const preview = action === 'hide' ? 'hidden' : OVERLAY_PREVIEWS[(index + 1) % OVERLAY_PREVIEWS.length] ?? 'hidden'
    snapshot = { ...snapshot, overlayPreview: preview }
    overlay = createOverlayPreview(preview, Date.now())
    return { ok: true }
  })

  for (const channel of [IPC.frame, IPC.frameFull, IPC.micChunk, IPC.overlayAction, IPC.overlayHover, IPC.overlayReady]) {
    ipcMain.on(channel, (event, payload: unknown) => {
      const kind = channel.startsWith('overlay:') ? 'overlay' : 'media'
      if (!isSender(event.sender, kind) || event.senderFrame !== event.sender.mainFrame) return
      const parsed = IpcSchemas[channel].safeParse(payload)
      if (!parsed.success) { console.error(`Invalid IPC payload: ${channel}`); return }
      if (channel === IPC.overlayHover) {
        const { interactive } = IpcSchemas[IPC.overlayHover].parse(parsed.data)
        getWindows()?.overlay.setIgnoreMouseEvents(!interactive, { forward: true })
      }
      if (channel === IPC.overlayReady) publish()
      if (channel === IPC.overlayAction && snapshot.overlayPreview !== 'hidden') {
        const action = IpcSchemas[IPC.overlayAction].parse(parsed.data)
        overlay = applyPreviewAction(overlay, action, Date.now())
        const previews: Record<OverlayAction['kind'], OverlayPreview> = {
          'take-me-back': 'note', snooze: 'snoozed', allow: 'focused', pause: 'paused', resume: 'focused',
          'dismiss-note': snapshot.overlayPreview ?? 'hidden',
        }
        snapshot = { ...snapshot, overlayPreview: previews[action.kind], stats: {
          ...snapshot.stats, logs: [...snapshot.stats.logs, `Overlay preview: ${action.kind}`].slice(-50),
        } }
        publish()
      }
    })
  }
}
