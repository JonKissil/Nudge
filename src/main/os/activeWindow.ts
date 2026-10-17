import { systemPreferences } from 'electron'
import { WindowInfoSchema, type WindowInfo } from '../../shared/types'

export async function readActiveWindow(): Promise<WindowInfo | undefined> {
  // Keep the ESM package and its native helper outside the main bundle.
  const { activeWindow } = await import('get-windows')
  const result = await activeWindow({
    accessibilityPermission: process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false),
    screenRecordingPermission: process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('screen') === 'granted',
  })
  if (!result) return undefined
  return WindowInfoSchema.parse({
    app: result.owner.name, bundleId: result.platform === 'macos' ? result.owner.bundleId : '',
    title: result.title, bounds: result.bounds, id: result.id, ownerPid: result.owner.processId,
    url: result.platform === 'macos' && result.url ? result.url : undefined,
  })
}

export function startActiveWindowPoller(onChange: (window: WindowInfo | undefined) => void,
  onError: (message: string) => void): () => void {
  let stopped = false, busy = false, previous = '', lastError = ''
  const poll = async (): Promise<void> => {
    if (stopped || busy) return
    busy = true
    try {
      const window = await readActiveWindow()
      if (stopped) return
      const key = JSON.stringify(window ?? null)
      if (key !== previous) { previous = key; onChange(window) }
      lastError = ''
    } catch {
      if (stopped) return
      // Native errors may embed the full window result; never forward that payload as a log.
      const message = 'Active window could not be read. Check Screen Recording and Accessibility permissions.'
      if (message !== lastError) { lastError = message; onError(message) }
      if (previous !== 'null') { previous = 'null'; onChange(undefined) }
    } finally { busy = false }
  }
  const timer = setInterval(() => { void poll() }, 1000)
  void poll()
  return () => { stopped = true; clearInterval(timer) }
}
