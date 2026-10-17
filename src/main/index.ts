import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerScaffoldIpc } from './session/session'
import { createWindows, loadWindows } from './windows'

app.setName('Nudge')

async function bootstrap(): Promise<void> {
  // Load secrets into main only; Vite never receives an API key define or env prefix.
  const envPath = join(app.getAppPath(), '.env')
  if (existsSync(envPath)) process.loadEnvFile(envPath)

  const windows = createWindows()
  const controller = registerScaffoldIpc(() => windows)
  app.once('before-quit', controller.dispose)
  windows.control.on('closed', () => { app.quit() })
  await loadWindows(windows)
}

app.whenReady().then(bootstrap).catch((error: unknown) => {
  console.error('Nudge could not start:', error instanceof Error ? error.message : 'Unknown error')
  app.quit()
})
app.on('window-all-closed', () => { app.quit() })
