import { desktopCapturer, screen, session } from 'electron'
import type { BrowserWindow } from 'electron'

export function registerScreenCapture(media: BrowserWindow, allowed: () => boolean,
  onError: (message: string) => void): () => void {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (request.frame !== media.webContents.mainFrame || !allowed() || !request.videoRequested || request.audioRequested) {
      callback({})
      return
    }
    void desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).then((sources) => {
      if (media.isDestroyed() || !allowed()) { callback({}); return }
      const source = sources.find((item) => item.display_id === String(screen.getPrimaryDisplay().id))
      if (!source) { onError('The primary display could not be found.'); callback({}); return }
      callback({ video: source })
    }).catch(() => {
      onError('Screen capture could not start. Check Screen Recording permission, then restart the app.')
      callback({})
    })
  })
  return () => { session.defaultSession.setDisplayMediaRequestHandler(null) }
}
