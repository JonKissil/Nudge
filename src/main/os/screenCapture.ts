import { desktopCapturer, session } from 'electron'
import type { BrowserWindow } from 'electron'
import type { CapturePolicy } from '../../shared/privacy'

export function registerScreenCapture(media: BrowserWindow, allowed: () => boolean,
  onError: (message: string) => void, getPolicy: () => CapturePolicy | undefined): () => void {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const policy = getPolicy()
    if (!policy || request.frame !== media.webContents.mainFrame || !allowed() || !request.videoRequested || request.audioRequested) {
      callback({})
      return
    }
    void desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } }).then((sources) => {
      if (media.isDestroyed() || !allowed() || getPolicy()?.revision !== policy.revision) { callback({}); return }
      const source = sources.find((item) => item.id.startsWith(`window:${policy.windowId}:`))
      if (!source) { onError('The approved window could not be captured.'); callback({}); return }
      callback({ video: source })
    }).catch(() => {
      onError('Screen capture could not start. Check Screen Recording permission, then restart the app.')
      callback({})
    })
  })
  return () => { session.defaultSession.setDisplayMediaRequestHandler(null) }
}
