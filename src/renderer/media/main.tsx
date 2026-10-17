<<<<<<< HEAD
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioPlayer, MicCapture } from './audio'
import { ScreenCapture } from './capture'

export function Media() {
  if (window.nudge.kind !== 'media') throw new Error('The media preload is unavailable')
  useEffect(() => {
    if (window.nudge.kind !== 'media') return
    const api = window.nudge
    const mic = new MicCapture((pcm16Base64) => api.sendMicChunk({ pcm16Base64 }))
    const player = new AudioPlayer()
    const capture = new ScreenCapture(api)
    const unsubscribe = [
      api.onMicSet(({ open }) => { void mic.setOpen(open).catch(() => console.error('Microphone unavailable')) }),
      api.onAudioPlay(({ pcm24Base64 }) => { void player.play(pcm24Base64).catch(() => console.error('Audio playback unavailable')) }),
      api.onAudioFlush(() => player.flush()),
      api.onAudioChime(() => { void player.chime().catch(() => console.error('Chime unavailable')) }),
      api.onCaptureSet(({ running }) => capture.setRunning(running)),
      api.onFullFrameRequest(() => { void capture.sendFullFrame() }),
    ]
    api.ready()
    return () => {
      unsubscribe.forEach((stop) => stop())
      mic.close()
      player.close()
      capture.dispose()
    }
  }, [])
<<<<<<< Updated upstream
  return <p>Media ready. Microphone is off until check-in.</p>
=======
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

export function Media() {
  if (window.nudge.kind !== 'media') throw new Error('The media preload is unavailable')
  // Capture and audio are intentionally inactive until M2/M3.
  return <p>Media ready. Capture and microphone are off.</p>
>>>>>>> f5bb2fc (Scaffold)
=======
  return <p>Media ready. Capture starts after locking your task window. Microphone is off until check-in.</p>
>>>>>>> Stashed changes
}

createRoot(document.getElementById('root')!).render(<StrictMode><Media /></StrictMode>)
