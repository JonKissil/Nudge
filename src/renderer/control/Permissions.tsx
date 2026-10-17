import { useEffect, useState } from 'react'
import type { ControlApi } from '../../shared/bridge'
import type { PermissionStatus } from '../../shared/types'
import styles from './App.module.css'

export function Permissions({ api }: { api: ControlApi }) {
  const [status, setStatus] = useState<PermissionStatus>()
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')
  const refresh = async (): Promise<void> => {
    try { setStatus(await api.getPermissionStatus()); setError('') }
    catch { setError('Could not check permissions right now.') }
  }
  useEffect(() => { void refresh() }, [])
  const open = async (kind: 'screen' | 'microphone' | 'automation' | 'accessibility'): Promise<void> => {
    const result = await api.openPermissionSettings(kind)
    if (!result.ok) setError(result.error)
  }
  const requestMicrophone = async (): Promise<void> => {
    setError('')
    const result = await api.requestMicrophoneAccess()
    await refresh()
    if (!result.ok) setError(result.error)
  }
  const testMicrophone = async (): Promise<void> => {
    setTesting(true)
    setTestResult('Listening locally for three seconds. Say “testing” now…')
    try {
      const result = await api.testMicrophone()
      setTestResult(result.ok
        ? result.peak >= 0.02
          ? `Microphone working: ${result.chunks} audio chunks received, ${Math.round(result.peak * 100)}% peak level.`
          : `Microphone connected and sent ${result.chunks} chunks, but no clear sound was detected. Speak and try again.`
        : result.error ?? 'The microphone check did not receive audio.')
    } catch { setTestResult('The microphone check could not run. Please restart Nudge and try again.') }
    finally { setTesting(false) }
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
          <div className={styles.permissionActions}>
            <button type="button" onClick={() => { void requestMicrophone() }}>Request access</button>
            <button type="button" disabled={status?.microphone !== 'granted' || testing}
              onClick={() => { void testMicrophone() }}>Test mic</button>
          </div></li>
        <li><span>Accessibility <small>{status?.accessibility ?? 'checking'}</small></span>
          <button type="button" onClick={() => { void open('accessibility') }}>Open settings</button></li>
        <li><span>Chrome Automation <small>prompt appears on first return</small></span>
          <button type="button" onClick={() => { void open('automation') }}>Open settings</button></li>
      </ul>
      {testResult && <p role="status">{testResult}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  )
}
