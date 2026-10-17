import type { ReactNode } from 'react'
import type { OverlayAction } from '../../shared/types'
import styles from './Overlay.module.css'

export interface OverlayControls {
  onAction: (action: OverlayAction) => void
  onInteractive: (interactive: boolean) => void
}

export function OverlayButton({ children, label, onClick, onInteractive, secondary = false }: {
  children: ReactNode; label: string; onClick: () => void
  onInteractive: (interactive: boolean) => void; secondary?: boolean
}) {
  return <button type="button" aria-label={label} title={label}
    className={secondary ? styles.secondaryButton : styles.button}
    onMouseEnter={() => onInteractive(true)} onMouseLeave={() => onInteractive(false)}
    onClick={onClick}>{children}</button>
}
