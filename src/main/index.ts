import { app, globalShortcut } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerScaffoldIpc } from './session/session'
import { registerPermissionsIpc } from './permissions'
import { createWindows, loadWindows } from './windows'
import { createMenuBar } from './menuBar'

// Model audio comes from a hidden renderer, so it has no click to unlock playback.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.setName('Nudge')

async function bootstrap(): Promise<void> {
  // Load secrets into main only; Vite never receives an API key define or env prefix.
  const envPath = join(app.getAppPath(), '.env')
  if (existsSync(envPath)) process.loadEnvFile(envPath)

  const windows = createWindows()
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
  if (process.platform === 'darwin') {
    let quitting = false
    let quitRequested = false
    const showControl = (): void => {
      if (quitting || windows.control.isDestroyed()) return
      if (windows.control.isMinimized()) windows.control.restore()
      windows.control.show()
      windows.control.focus()
      app.focus({ steal: true })
    }
    const menuBar = createMenuBar(session, showControl, () => {
      if (quitRequested) return
      quitRequested = true
      void session.endSession().catch((error: unknown) => {
        console.error('Could not end the session before quitting:',
          error instanceof Error ? error.message : 'Unknown error')
      }).finally(() => { app.quit() })
    })
    app.once('before-quit', () => { quitting = true })
    app.once('will-quit', () => { menuBar.dispose() })
    app.on('activate', showControl)
    windows.control.on('close', (event) => {
      if (quitting) return
      event.preventDefault()
      windows.control.hide()
    })
    // A resident menu-bar app does not need a second icon in the Dock.
    app.dock?.hide()
  } else {
    windows.control.on('closed', () => { app.quit() })
  }
  await loadWindows(windows)
}

app.whenReady().then(bootstrap).catch((error: unknown) => {
  console.error('Nudge could not start:', error instanceof Error ? error.message : 'Unknown error')
  app.quit()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => { globalShortcut.unregisterAll() })
