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
    const mic = new MicCapture((pcm16Base64) => api.sendMicChunk({ pcm16Base64 }))
    const player = new AudioPlayer((progress) => api.sendAudioProgress(progress))
    const capture = new ScreenCapture(api)
    const stopMicTest = attachMicTest(api)
    const unsubscribe = [
      api.onMicSet(({ open }) => { void mic.setOpen(open).catch(() => console.error('Microphone unavailable')) }),
      api.onAudioPlay(({ pcm24Base64, playbackId }) => {
        void player.play(pcm24Base64, playbackId).catch(() => console.error('Audio playback unavailable'))
      }),
      api.onAudioFlush(() => player.flush()),
      api.onAudioReset(() => player.close()),
      api.onAudioChime(({ cue }) => { void player.chime(cue).catch(() => console.error('Chime unavailable')) }),
      api.onCaptureSet(({ running }) => capture.setRunning(running)),
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
