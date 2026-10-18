import type { NudgeView } from '../../shared/types'
import { OverlayButton, type OverlayControls } from './OverlayButton'
import styles from './Overlay.module.css'
import mascotClosed from '../assets/gorilla1.png'
import mascotOpen from '../assets/gorilla2.png'

export function NudgeCard({ nudge, speaking = false, onAction, onInteractive }:
  OverlayControls & { nudge: NudgeView; speaking?: boolean }) {
  return <section className={styles.nudge} aria-label="A gentle check-in">
    <span aria-hidden="true" className={styles.nudgeMascot} data-speaking={speaking}>
      <img src={mascotClosed} alt="" className={styles.mascotClosed} />
      <img src={mascotOpen} alt="" className={styles.mascotOpen} />
    </span>
    <div className={styles.nudgeContent}>
      <span className={styles.eyebrow}>A MOMENT TO CHECK IN</span>
      <p role="status">{nudge.text}</p>
      <div className={styles.actions}>
        <OverlayButton label="Take me back" onInteractive={onInteractive}
          onClick={() => onAction({ kind: 'take-me-back' })}>Take me back <span aria-hidden="true">↗</span></OverlayButton>
        <OverlayButton label="Show me how" onInteractive={onInteractive} secondary
          onClick={() => onAction({ kind: 'guide-me' })}>Show me how</OverlayButton>
        <OverlayButton label="5 more min" onInteractive={onInteractive} secondary
          onClick={() => onAction({ kind: 'snooze' })}>5 more min</OverlayButton>
        <OverlayButton label="This is for my task" onInteractive={onInteractive} secondary
          onClick={() => onAction({ kind: 'allow' })}>This is for my task</OverlayButton>
      </div>
    </div>
  </section>
}
