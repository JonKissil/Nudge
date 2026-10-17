<<<<<<< HEAD
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { OverlayApi } from '../../shared/bridge'
import type { OverlayState } from '../../shared/types'
import { Pill } from './Pill'
import { NudgeCard } from './NudgeCard'
import { Arrow } from './Arrow'
import { StickyNote } from './StickyNote'
import { Captions } from './Captions'
import styles from './Overlay.module.css'

function getApi(): OverlayApi {
  if (window.nudge.kind !== 'overlay') throw new Error('The overlay preload is unavailable')
  return window.nudge
}

export function Overlay() {
  const [state, setState] = useState<OverlayState>()
  const [now, setNow] = useState(Date.now())
  const interactive = useRef(false)
  const onInteractive = useCallback((next: boolean) => {
    if (next === interactive.current) return
    interactive.current = next
    getApi().setInteractive(next)
  }, [])
  useEffect(() => {
    const unsubscribe = getApi().onState((next) => { setNow(Date.now()); setState(next) })
    const timer = setInterval(() => setNow(Date.now()), 1000)
    const move = (event: MouseEvent): void => {
      onInteractive(Boolean(document.elementFromPoint(event.clientX, event.clientY)?.closest('button')))
    }
    const leave = (): void => onInteractive(false)
    window.addEventListener('mousemove', move)
    document.documentElement.addEventListener('mouseleave', leave)
    return () => {
      unsubscribe(); clearInterval(timer)
      window.removeEventListener('mousemove', move)
      document.documentElement.removeEventListener('mouseleave', leave)
      getApi().setInteractive(false)
      interactive.current = false
    }
  }, [onInteractive])
  useEffect(() => {
    // Text and timer updates should not disable a button while it is being clicked.
    getApi().setInteractive(false)
    interactive.current = false
  }, [state?.pill.state, Boolean(state?.nudge), state?.notes.map((note) => note.id).join(',')])

  const controls = { onAction: getApi().action, onInteractive }
  const visible = state && !['IDLE', 'SETUP', 'ENDED'].includes(state.pill.state)
  return <div className={styles.surface}>
    {visible && <Pill pill={state.pill} now={now} {...controls} />}
    {state?.nudge && <NudgeCard nudge={state.nudge} {...controls} />}
    {state?.arrow && <Arrow arrow={state.arrow} />}
    {state?.notes.map((note) => <StickyNote key={`${note.id}:${note.expiresAt}`} note={note} {...controls} />)}
    {state?.caption?.trim() && <Captions text={state.caption} />}
  </div>
=======
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
>>>>>>> f5bb2fc (Scaffold)
}

createRoot(document.getElementById('root')!).render(<StrictMode><Overlay /></StrictMode>)
