import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioPlayer, MicCapture } from './audio'
import { ScreenCapture } from './capture'
import { attachMicTest } from './micTest'

export function Media() {
  if (window.nudge.kind !== 'media') throw new Error('The media preload is unavailable')
  useEffect(() => {
    if (window.nudge.kind !== 'media') return
    const api = window.nudge
    let micRevision = 0
    const mic = new MicCapture((pcm16Base64) => api.sendMicChunk({ pcm16Base64, revision: micRevision }))
    const player = new AudioPlayer()
    const capture = new ScreenCapture(api)
    const stopMicTest = attachMicTest(api)
    const unsubscribe = [
      api.onMicSet(({ open, revision }) => { micRevision = revision; void mic.setOpen(open).catch(() => console.error('Microphone unavailable')) }),
      api.onAudioPlay(({ pcm24Base64 }) => { void player.play(pcm24Base64).catch(() => console.error('Audio playback unavailable')) }),
      api.onAudioFlush(() => player.flush()),
      api.onAudioReset(() => player.close()),
      api.onAudioChime(() => { void player.chime().catch(() => console.error('Chime unavailable')) }),
      api.onCaptureSet(({ running, policy, revision, commandId }) => capture.setRunning(running, policy, revision, commandId)),
      api.onFullFrameRequest(() => { void capture.sendFullFrame() }),
    ]
    api.ready()
    return () => {
      unsubscribe.forEach((stop) => stop())
      mic.close()
      player.close()
      capture.dispose()
      stopMicTest()
    }
  }, [])
  return <p>Media ready. Capture starts after locking a task window; the microphone stays off until check-in.</p>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Media /></StrictMode>)
