import { ipcMain, shell, systemPreferences } from 'electron'
import { IPC, IpcSchemas } from '../shared/ipc'
import { PermissionStatusSchema } from '../shared/types'
import type { AppWindows } from './windows'

const settingsBase = 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?'
const panes = {
  screen: `${settingsBase}Privacy_ScreenCapture`,
  microphone: `${settingsBase}Privacy_Microphone`,
  automation: `${settingsBase}Privacy`,
  accessibility: `${settingsBase}Privacy_Accessibility`,
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
      accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied',
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
  ipcMain.handle(IPC.permissionsRequestMicrophone, async (event, payload: unknown) => {
    if (!fromControl(event) || !IpcSchemas[IPC.permissionsRequestMicrophone].safeParse(payload).success) {
      return { ok: false, error: 'Control window only.' }
    }
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return { ok: true }
    if (status === 'denied') {
      // A new launch context can inherit a denied status before Electron has made
      // its own request. Try the native API once; macOS will return false silently
      // when the denial already belongs to this app.
      try {
        if (await systemPreferences.askForMediaAccess('microphone')) return { ok: true }
      } catch { /* Offer the Settings pane below. */ }
      try { await shell.openExternal(panes.microphone) }
      catch { return { ok: false, error: 'Open System Settings → Privacy & Security → Microphone.' } }
      return { ok: false, error: 'Microphone access is denied. Enable the app that launched Nudge in System Settings, then fully restart it and Nudge.' }
    }
    if (status !== 'not-determined') return { ok: false, error: 'Microphone access is restricted on this Mac.' }
    try {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      return granted ? { ok: true } : { ok: false, error: 'Microphone access was not granted.' }
    } catch {
      return { ok: false, error: 'Could not request microphone access.' }
    }
  })
}
