import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ControlApi } from '../../shared/bridge'
import type { SessionSnapshot } from '../../shared/types'
import { DEMO_TASK } from '../../shared/config'
import type { LanguageCode } from '../../shared/languages'
import { Settings } from './Settings'
import styles from './App.module.css'

function getApi(): ControlApi {
  if (window.nudge.kind !== 'control') throw new Error('The control preload is unavailable')
  return window.nudge
}

export function App() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>()
  const [task, setTask] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [language, setLanguage] = useState<LanguageCode>('en')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<'home' | 'settings'>('home')
  const settingsButton = useRef<HTMLButtonElement>(null)
  const settingsHeading = useRef<HTMLHeadingElement>(null)
  const navigated = useRef(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let active = true
    const api = getApi()
    const unsubscribe = api.onSnapshot((next) => { if (active) setSnapshot(next) })
    void api.getSnapshot().then((next) => {
      if (!active) return
      setSnapshot(next)
      setTask(next.task)
      setMinutes(next.minutes)
      setLanguage(next.language)
    }).catch(() => { if (active) setError('Could not load the app. Please restart Nudge.') })
    return () => { active = false; unsubscribe() }
  }, [])
  useEffect(() => {
    if (!snapshot?.lockWindowAt) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [snapshot?.lockWindowAt])
  useEffect(() => {
    if (navigated.current) {
      window.scrollTo(0, 0)
      if (page === 'settings') settingsHeading.current?.focus()
      else settingsButton.current?.focus()
    }
    navigated.current = true
  }, [page])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await getApi().startSession({ task, minutes, language })
      if (!result.ok) setError(result.error)
    } catch { setError('Could not save your task. Please try again.') }
    finally { setBusy(false) }
  }

  async function command(action: () => Promise<{ ok: boolean; error?: string }>, failure: string): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      if (!result.ok) setError(result.error ?? failure)
    } catch { setError(failure) }
    finally { setBusy(false) }
  }

  async function setDemoMode(enabled: boolean): Promise<void> {
    await command(() => getApi().setSettings({ demoMode: enabled, showHud: enabled || snapshot?.settings.showHud || false }),
      'Could not change demo mode.')
    if (enabled && (!task.trim() || task === snapshot?.task)) { setTask(DEMO_TASK); setMinutes(30) }
  }

  async function startAndLock(): Promise<void> {
    await command(async () => {
      const api = getApi()
      const saved = await api.startSession({ task, minutes, language })
      return saved.ok ? api.lockTaskWindow() : saved
    }, 'Could not start the session.')
  }

  const active = Boolean(snapshot && !['IDLE', 'SETUP', 'ENDED'].includes(snapshot.state))
  const remaining = snapshot?.lockWindowAt ? Math.max(1, Math.ceil((snapshot.lockWindowAt - now) / 1000)) : 0

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        {page === 'home' ? <>
          <span className={styles.brand}>Nudge</span>
          <button ref={settingsButton} type="button" className={styles.navigation} aria-label="Settings"
            title="Settings" onClick={() => setPage('settings')}>
            Settings
          </button>
        </> : <>
          <button type="button" className={styles.navigation} onClick={() => setPage('home')}>← Back</button>
          <h1 ref={settingsHeading} tabIndex={-1}>Settings</h1>
        </>}
      </header>
      {page === 'home' ? <form className={styles.card} onSubmit={(event) => { void submit(event) }}>
        <label htmlFor="task">Task</label>
        <textarea id="task" value={task} onChange={(event) => setTask(event.target.value)}
          placeholder="What are you working on?" required maxLength={1000} rows={3} disabled={active} />
        <label htmlFor="minutes">Duration</label>
        <div className={styles.duration}>
          <input id="minutes" type="number" min={1} max={240} required value={minutes} disabled={active}
            onChange={(event) => setMinutes(event.target.valueAsNumber)} />
          <span>minutes</span>
        </div>
        <button type="submit" disabled={!snapshot || busy || !task.trim() || active}>
          {active ? (snapshot?.state === 'PAUSED' ? 'Session paused' : 'Session running') : 'Save task'}
        </button>
        {snapshot?.state === 'SETUP' && <div className={styles.lockStep}>
          <p>After starting, switch to your task window within 3 seconds.</p>
          <button type="button" disabled={busy || Boolean(snapshot.lockWindowAt)}
            onClick={() => { void startAndLock() }}>
            {snapshot.lockWindowAt ? `Switch to your task · ${remaining}` : 'Start session'}
          </button>
          {snapshot.lockError && <p role="alert" className={styles.error}>{snapshot.lockError}</p>}
        </div>}
      </form> : <Settings api={getApi()} snapshot={snapshot} busy={busy} active={active}
        command={command} setDemoMode={setDemoMode} language={language} setLanguage={setLanguage} />}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </main>
  )
}
