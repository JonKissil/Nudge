import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

export function Media() {
  if (window.nudge.kind !== 'media') throw new Error('The media preload is unavailable')
  // Capture and audio are intentionally inactive until M2/M3.
  return <p>Media ready. Capture and microphone are off.</p>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Media /></StrictMode>)
