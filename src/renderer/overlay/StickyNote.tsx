import type { NoteView } from '../../shared/types'
import { useState } from 'react'
import { OverlayButton, type OverlayControls } from './OverlayButton'
import styles from './Overlay.module.css'

export function StickyNote({ note, onAction, onInteractive }: OverlayControls & { note: NoteView }) {
  const [fadeDelay] = useState(() => Math.max(0, note.expiresAt - Date.now() - 300))
  return <aside className={styles.note} aria-label="One small next step" style={{
    left: `clamp(16px, calc(${(note.anchor.x + note.anchor.w) * 100}% + 12px), calc(100% - 288px))`,
    top: `clamp(64px, ${note.anchor.y * 100}%, calc(100% - 200px))`,
    animationDelay: `${fadeDelay}ms`,
  }}>
    <div className={styles.noteHeader}>
      <span className={styles.eyebrow}>ONE SMALL NEXT STEP</span>
      <OverlayButton label="Dismiss next step" onInteractive={onInteractive} secondary
        onClick={() => onAction({ kind: 'dismiss-note', id: note.id })}><span aria-hidden="true">×</span></OverlayButton>
    </div>
    <p>{note.text}</p>
    <span className={styles.noteFooter}>Just a place to begin.</span>
  </aside>
}
