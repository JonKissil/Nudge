import { useCallback, useEffect, useRef, useState } from 'react'
import type { ControlApi } from '../../shared/bridge'
import type { PermissionStatus, SessionSnapshot } from '../../shared/types'
import { permissionView } from './permissionView'
import styles from './App.module.css'

export function Permissions({ api, snapshot }: { api: ControlApi; snapshot?: SessionSnapshot }) {
  const [status, setStatus] = useState<PermissionStatus>()
  const [error, setError] = useState('')
  const [checkError, setCheckError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')
  const mounted = useRef(false)
  const request = useRef(0)
  const refresh = useCallback(async (): Promise<void> => {
    const id = ++request.current
    try {
      const next = await api.getPermissionStatus()
      if (mounted.current && id === request.current) { setStatus(next); setCheckError('') }
    } catch {
      if (mounted.current && id === request.current) setCheckError('Could not check permissions right now.')
    }
  }, [api])
  useEffect(() => {
    mounted.current = true
    const refreshVisible = (): void => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const timer = setInterval(refreshVisible, 3000)
    return () => {
      mounted.current = false
      request.current++
      clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [refresh])
  const open = async (kind: 'screen' | 'microphone' | 'automation' | 'accessibility'): Promise<void> => {
    setError('')
    try {
      const result = await api.openPermissionSettings(kind)
      if (!result.ok) setError(result.error)
    } catch { setError('Could not open System Settings. Please open Privacy & Security manually.') }
  }
  const requestMicrophone = async (): Promise<void> => {
    setError('')
    try {
      const result = await api.requestMicrophoneAccess()
      await refresh()
      if (!result.ok) setError(result.error)
    } catch { setError('Could not request microphone access. Please try again.') }
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
  const screen = permissionView('screen', status, snapshot)
  const microphone = permissionView('microphone', status, snapshot)
  const accessibility = permissionView('accessibility', status, snapshot)
  const needsAttention = [screen, microphone, accessibility].some((item) => item.needsAttention)
  return (
    <section className={styles.permissions} aria-label="Mac permissions">
      <div className={styles.previewHeader}><strong>Mac permissions</strong>
        <button type="button" onClick={() => { void refresh() }}>Refresh</button></div>
      <p>Allow Nudge to see your screen and hear you during check-ins. The app may ask you to restart afterward.</p>
      <ul>
        <li><span>Screen Recording <small>{screen.label}</small></span>
          <button type="button" onClick={() => { void open('screen') }}>Open settings</button></li>
        <li><span>Microphone <small>{microphone.label}</small></span>
          <div className={styles.permissionActions}>
            <button type="button" onClick={() => { void requestMicrophone() }}>Request access</button>
            <button type="button" disabled={status?.microphone !== 'granted' || testing}
              onClick={() => { void testMicrophone() }}>Test mic</button>
          </div></li>
        <li><span>Accessibility <small>{accessibility.label}</small></span>
          <button type="button" onClick={() => { void open('accessibility') }}>Open settings</button></li>
        <li><span>Browser Automation <small>Safari, Chrome, or your supported browser</small></span>
          <button type="button" onClick={() => { void open('automation') }}>Open settings</button></li>
      </ul>
      {needsAttention && <p>If access is already enabled in System Settings, fully quit and reopen Nudge.
        In development, also check the terminal or editor that launched it. This checklist refreshes when you return.</p>}
      {testResult && <p role="status">{testResult}</p>}
      {(error || checkError) && <p role="alert" className={styles.error}>{error || checkError}</p>}
    </section>
  )
}
