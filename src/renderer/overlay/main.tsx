import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import styles from './Overlay.module.css'

export function Overlay() {
  useEffect(() => {
    if (window.nudge.kind !== 'overlay') throw new Error('The overlay preload is unavailable')
    // M1 will render the Pill, NudgeCard, Arrow, StickyNote, and Captions from this state.
    return window.nudge.onState(() => {})
  }, [])
  return <div className={styles.surface} aria-hidden="true" />
}

createRoot(document.getElementById('root')!).render(<StrictMode><Overlay /></StrictMode>)
