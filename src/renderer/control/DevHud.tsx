import type { SessionSnapshot } from '../../shared/types'
import styles from './App.module.css'

export function DevHud({ snapshot }: { snapshot: SessionSnapshot }) {
  const { stats } = snapshot
  const handleAge = stats.resumptionHandleAgeMs === null
    ? 'none yet' : `${Math.floor(stats.resumptionHandleAgeMs / 1000)}s ago`
  return (
    <section className={styles.hud} aria-label="Developer status">
      <div className={styles.previewHeader}><strong>Live status</strong><span>{snapshot.conn}</span></div>
      <dl className={styles.hudGrid}>
        <div><dt>Session</dt><dd>{snapshot.state}</dd></div>
        <div><dt>Microphone</dt><dd>{snapshot.micOpen ? 'listening' : 'off'}</dd></div>
        <div><dt>Rule</dt><dd>{stats.ruleVerdict ?? '—'}</dd></div>
        <div><dt>Frames/min</dt><dd>{stats.framesPerMinute}</dd></div>
        <div><dt>Resume handle</dt><dd>{handleAge}</dd></div>
      </dl>
      <p><strong>Current window:</strong> {stats.currentWindow
        ? `${stats.currentWindow.app} · ${stats.currentWindow.title}` : 'none yet'}</p>
      <p><strong>Model status:</strong> {snapshot.lastStatus
        ? `${snapshot.lastStatus.on_task ? 'on task' : 'off task'} · ${snapshot.lastStatus.activity} · ${Math.round(snapshot.lastStatus.confidence * 100)}%`
        : 'none yet'}</p>
      <details>
        <summary>Recent state changes ({stats.transitions.length})</summary>
        <ol>{stats.transitions.map((change, index) => (
          <li key={`${change.at}-${index}`}>{change.from} → {change.to} · {new Date(change.at).toLocaleTimeString()}</li>
        ))}</ol>
      </details>
      <details>
        <summary>Connection log ({stats.logs.length})</summary>
        <ol>{stats.logs.slice(-10).map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ol>
      </details>
    </section>
  )
}
