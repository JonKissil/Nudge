import type { NudgeView } from '../../shared/types'
import { OverlayButton, type OverlayControls } from './OverlayButton'
import styles from './Overlay.module.css'
import mascot from '../assets/sprout-mascot.png'

export function NudgeCard({ nudge, onAction, onInteractive }: OverlayControls & { nudge: NudgeView }) {
  return <section className={styles.nudge} aria-label="A gentle check-in">
    <img src={mascot} alt="" className={styles.nudgeMascot} />
    <span className={styles.eyebrow}>A MOMENT TO CHECK IN</span>
    <p>{nudge.text}</p>
    <div className={styles.actions}>
      <OverlayButton label="Take me back" onInteractive={onInteractive}
        onClick={() => onAction({ kind: 'take-me-back' })}>Take me back <span aria-hidden="true">↗</span></OverlayButton>
      <OverlayButton label="5 more min" onInteractive={onInteractive} secondary
        onClick={() => onAction({ kind: 'snooze' })}>5 more min</OverlayButton>
      <OverlayButton label="This is for my task" onInteractive={onInteractive} secondary
        onClick={() => onAction({ kind: 'allow' })}>This is for my task</OverlayButton>
    </div>
  </section>
}
