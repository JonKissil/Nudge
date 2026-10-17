import { app, globalShortcut } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerScaffoldIpc } from './session/session'
import { registerPermissionsIpc } from './permissions'
import { createWindows, loadWindows } from './windows'
import type { AppWindows } from './windows'

// Model audio comes from a hidden renderer, so it has no click to unlock playback.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.setName('Nudge')
const primaryInstance = app.requestSingleInstanceLock()
let controlWindow: AppWindows['control'] | undefined

async function bootstrap(): Promise<void> {
  // Load secrets into main only; Vite never receives an API key define or env prefix.
  const envPath = join(app.getAppPath(), '.env')
  if (existsSync(envPath)) process.loadEnvFile(envPath)

  const windows = createWindows()
  controlWindow = windows.control
  const session = registerScaffoldIpc(() => windows)
  registerPermissionsIpc(() => windows)
  const shortcuts: Array<[string, () => void]> = [
    ['CommandOrControl+Shift+Space', () => { session.togglePushToTalk() }],
    ['CommandOrControl+Shift+P', () => { void session.togglePause() }],
    ['CommandOrControl+Shift+D', () => { session.toggleHud() }],
  ]
  for (const [accelerator, action] of shortcuts) {
    if (!globalShortcut.register(accelerator, action)) console.warn(`Shortcut unavailable: ${accelerator}`)
  }
  windows.control.on('closed', () => { app.quit() })
  await loadWindows(windows)
}

if (!primaryInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!controlWindow || controlWindow.isDestroyed()) return
    if (controlWindow.isMinimized()) controlWindow.restore()
    controlWindow.show()
    controlWindow.focus()
  })
  app.whenReady().then(bootstrap).catch((error: unknown) => {
    console.error('Nudge could not start:', error instanceof Error ? error.message : 'Unknown error')
    app.quit()
  })
}
app.on('window-all-closed', () => { app.quit() })
app.on('will-quit', () => { globalShortcut.unregisterAll() })
