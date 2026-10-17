import type { ArrowView } from '../../shared/types'
import styles from './Overlay.module.css'

export function Arrow({ arrow }: { arrow: ArrowView }) {
  return <div className={styles.arrow} role="status"
    style={{ left: `${arrow.x * 100}%`, top: `${arrow.y * 100}%` }}>
    <svg aria-hidden="true" width="44" height="44" viewBox="0 0 44 44">
      <path d="M34 36C31 20 20 12 5 5M5 5v18M5 5h18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span style={{
      left: arrow.x > 0.7 ? 'auto' : 20, right: arrow.x > 0.7 ? 44 : 'auto',
      top: arrow.y > 0.75 ? 'auto' : 48, bottom: arrow.y > 0.75 ? 44 : 'auto',
    }}>{arrow.label}</span>
  </div>
}
