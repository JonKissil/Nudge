import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ScreenCapture } from './capture'

export function Media() {
  useEffect(() => {
    if (window.nudge.kind !== 'media') throw new Error('The media preload is unavailable')
    const api = window.nudge
    const capture = new ScreenCapture(api)
    const unsubscribe = api.onCaptureSet(({ running }) => capture.setRunning(running))
    const unsubscribeFull = api.onFullFrameRequest(() => { void capture.sendFullFrame() })
    api.ready()
    return () => { unsubscribe(); unsubscribeFull(); capture.dispose() }
  }, [])
  return <p>Media ready. Screen capture starts after locking your task window. Microphone is off.</p>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Media /></StrictMode>)
