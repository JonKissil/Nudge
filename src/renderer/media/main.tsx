import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioPlayer, MicCapture } from './audio'

export function Media() {
  if (window.nudge.kind !== 'media') throw new Error('The media preload is unavailable')
  useEffect(() => {
    if (window.nudge.kind !== 'media') return
    const api = window.nudge
    const mic = new MicCapture((pcm16Base64) => api.sendMicChunk({ pcm16Base64 }))
    const player = new AudioPlayer()
    const unsubscribe = [
      api.onMicSet(({ open }) => { void mic.setOpen(open).catch(() => console.error('Microphone unavailable')) }),
      api.onAudioPlay(({ pcm24Base64 }) => { void player.play(pcm24Base64).catch(() => console.error('Audio playback unavailable')) }),
      api.onAudioFlush(() => player.flush()),
    ]
    return () => {
      unsubscribe.forEach((stop) => stop())
      mic.close()
      player.close()
    }
  }, [])
  return <p>Media ready. Microphone is off until check-in.</p>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Media /></StrictMode>)
