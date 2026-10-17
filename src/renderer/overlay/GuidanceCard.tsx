import { OverlayButton, type OverlayControls } from './OverlayButton'
import styles from './Overlay.module.css'

export function GuidanceCard({ text, onAction, onInteractive }: OverlayControls & { text: string }) {
  return <section className={styles.guidance} aria-label="Find your task">
    <span className={styles.eyebrow}>BACK TO YOUR TASK</span>
    <p>{text}</p>
    <OverlayButton label="Take me there" onInteractive={onInteractive}
      onClick={() => onAction({ kind: 'take-me-back' })}>Take me there ↗</OverlayButton>
  </section>
}
