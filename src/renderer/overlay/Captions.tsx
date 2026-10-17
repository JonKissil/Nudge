import styles from './Overlay.module.css'

export function Captions({ text }: { text: string }) {
  return <div className={styles.captions} role="status" aria-live="polite" aria-atomic="true">{text}</div>
}
