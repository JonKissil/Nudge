import { useEffect, useState } from 'react'
import type { ControlApi } from '../../shared/bridge'
import type { PermissionStatus } from '../../shared/types'
import styles from './App.module.css'

export function Permissions({ api }: { api: ControlApi }) {
  const [status, setStatus] = useState<PermissionStatus>()
  const [error, setError] = useState('')
  const refresh = async (): Promise<void> => {
    try { setStatus(await api.getPermissionStatus()); setError('') }
    catch { setError('Could not check permissions right now.') }
  }
  useEffect(() => { void refresh() }, [])
  const open = async (kind: 'screen' | 'microphone' | 'automation'): Promise<void> => {
    const result = await api.openPermissionSettings(kind)
    if (!result.ok) setError(result.error)
  }
  return (
    <section className={styles.permissions} aria-label="Mac permissions">
      <div className={styles.previewHeader}><strong>Mac permissions</strong>
        <button type="button" onClick={() => { void refresh() }}>Refresh</button></div>
      <p>Allow Nudge to see your screen and hear you during check-ins. The app may ask you to restart afterward.</p>
      <ul>
        <li><span>Screen Recording <small>{status?.screen ?? 'checking'}</small></span>
          <button type="button" onClick={() => { void open('screen') }}>Open settings</button></li>
        <li><span>Microphone <small>{status?.microphone ?? 'checking'}</small></span>
          <button type="button" onClick={() => { void open('microphone') }}>Open settings</button></li>
        <li><span>Chrome Automation <small>prompt appears on first return</small></span>
          <button type="button" onClick={() => { void open('automation') }}>Open settings</button></li>
      </ul>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  )
}
