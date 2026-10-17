import type { SessionSnapshot } from '../../shared/types'
import styles from './App.module.css'

export function DevHUD({ snapshot }: { snapshot: SessionSnapshot }) {
  const { stats } = snapshot
  return <section className={styles.hud} aria-label="Developer HUD">
    <h2>Perception HUD</h2>
    <dl>
      <dt>State / connection</dt><dd>{snapshot.state} / {snapshot.conn}</dd>
      <dt>Active app</dt><dd>{stats.currentWindow?.app ?? 'Unavailable'}</dd>
      <dt>Window title</dt><dd>{stats.currentWindow?.title || 'Unavailable — check Screen Recording'}</dd>
      <dt>URL</dt><dd>{stats.currentWindow?.url ?? 'Unavailable — browser URLs need Accessibility and Automation'}</dd>
      <dt>Rule verdict</dt><dd>{stats.ruleVerdict ?? 'Unavailable'}{stats.ruleVerdict === 'ask' && ' · model judgment arrives in M3'}</dd>
      <dt>Capture</dt><dd>{stats.capture?.state ?? 'off'}</dd>
      <dt>Frames / last minute</dt><dd>{stats.framesPerMinute} · includes 5s keyframes</dd>
      <dt>Last model status</dt><dd>{snapshot.lastStatus?.activity ?? 'Not connected yet'}</dd>
    </dl>
    {stats.logs.length > 0 && <details open><summary>Recent events</summary><ul>
      {stats.logs.slice(-10).map((line, i) => <li key={i}>{line}</li>)}
    </ul></details>}
    {stats.transitions.length > 0 && <details><summary>State transitions</summary><ul>
      {stats.transitions.map((transition, i) => <li key={i}>{transition.from} → {transition.to}</li>)}
    </ul></details>}
  </section>
}
