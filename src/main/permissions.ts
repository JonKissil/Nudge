import { ipcMain, shell, systemPreferences } from 'electron'
import { IPC, IpcSchemas } from '../shared/ipc'
import { PermissionStatusSchema } from '../shared/types'
import type { AppWindows } from './windows'

const settingsBase = 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?'
const panes = {
  screen: `${settingsBase}Privacy_ScreenCapture`,
  microphone: `${settingsBase}Privacy_Microphone`,
  automation: `${settingsBase}Privacy`,
} as const

export function registerPermissionsIpc(getWindows: () => AppWindows | undefined): void {
  const fromControl = (event: Electron.IpcMainInvokeEvent): boolean =>
    event.sender === getWindows()?.control.webContents && event.senderFrame === event.sender.mainFrame

  ipcMain.handle(IPC.permissionsStatus, (event, payload: unknown) => {
    if (!fromControl(event) || !IpcSchemas[IPC.permissionsStatus].safeParse(payload).success) {
      throw new Error('Invalid permission status request')
    }
    return PermissionStatusSchema.parse({
      screen: systemPreferences.getMediaAccessStatus('screen'),
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
    })
  })
  ipcMain.handle(IPC.permissionsOpen, async (event, payload: unknown) => {
    if (!fromControl(event)) return { ok: false, error: 'Control window only.' }
    const parsed = IpcSchemas[IPC.permissionsOpen].safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'Invalid settings request.' }
    try {
      await shell.openExternal(panes[parsed.data.kind])
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not open System Settings.' }
    }
  })
}
