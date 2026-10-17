import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ControlApi } from '../../shared/bridge'
import type { SessionSnapshot } from '../../shared/types'
import { DEMO_TASK } from '../../shared/config'
import { DevHud } from './DevHud'
import { Permissions } from './Permissions'
import styles from './App.module.css'

function getApi(): ControlApi {
  if (window.nudge.kind !== 'control') throw new Error('The control preload is unavailable')
  return window.nudge
}

export function App() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>()
  const [task, setTask] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
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
    }).catch(() => { if (active) setError('Could not load the app. Please restart Nudge.') })
    return () => { active = false; unsubscribe() }
  }, [])
  useEffect(() => {
    if (!snapshot?.lockWindowAt) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [snapshot?.lockWindowAt])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await getApi().startSession({ task, minutes })
      if (!result.ok) setError(result.error)
    } catch { setError('Could not save your task. Please try again.') }
    finally { setBusy(false) }
  }

  async function previewOverlay(action: 'next' | 'hide'): Promise<void> {
    setPreviewBusy(true)
    setError('')
    try {
      const result = await getApi().previewOverlay(action)
      if (!result.ok) setError(result.error)
    } catch { setError('Could not update the overlay preview. Please try again.') }
    finally { setPreviewBusy(false) }
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

  const active = snapshot && !['IDLE', 'SETUP', 'ENDED'].includes(snapshot.state)
  const remaining = snapshot?.lockWindowAt ? Math.max(1, Math.ceil((snapshot.lockWindowAt - now) / 1000)) : 0

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}><span className={styles.mark} aria-hidden="true">↗</span> Nudge</span>
        <span className={styles.badge}>Study session</span>
      </header>
      <p className={styles.eyebrow}>A LITTLE COMPANY FOR YOUR FOCUS</p>
      <h1>One thing at a time.</h1>
      <p className={styles.intro}>Make a little space for what you want to work on. We’ll start with one task.</p>
      <form className={styles.card} onSubmit={(event) => { void submit(event) }}>
        <label htmlFor="task">What are you working on?</label>
        <textarea id="task" value={task} onChange={(event) => setTask(event.target.value)}
          placeholder="An essay, a problem set, a little reading…" required maxLength={1000} rows={3} />
        <label htmlFor="minutes">How long would you like?</label>
        <div className={styles.duration}>
          <input id="minutes" type="number" min={1} max={240} required value={minutes}
            onChange={(event) => setMinutes(event.target.valueAsNumber)} />
          <span>minutes</span>
        </div>
        <button type="submit" disabled={!snapshot || busy || !task.trim() || Boolean(active)}>Save task <span aria-hidden="true">↗</span></button>
        {snapshot?.state === 'SETUP' && <div className={styles.lockStep}>
          <p>Open your task document in Safari, Chrome, or another supported browser—or in a document app.
            Then lock that window. You’ll have three seconds to switch to it.</p>
          <button type="button" disabled={busy || Boolean(snapshot.lockWindowAt)}
            onClick={() => { void command(() => getApi().lockTaskWindow(), 'Could not lock the task window.') }}>
            {snapshot.lockWindowAt ? `Switch to your document · ${remaining}` : 'Lock task window'}
          </button>
          {snapshot.lockError && <p role="alert" className={styles.error}>{snapshot.lockError}</p>}
        </div>}
        {active && <div className={styles.sessionActions}>
          <p role="status">{snapshot?.state} · {snapshot?.taskWindow?.title ?? 'Task window locked'}</p>
          <button type="button" onClick={() => { void command(() => getApi().togglePause(), 'Could not change pause state.') }}>
            {snapshot?.state === 'PAUSED' ? 'Resume session' : 'Pause session'}
          </button>
          <button type="button" onClick={() => { void command(() => getApi().endSession(), 'Could not end the session.') }}>
            End session
          </button>
        </div>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </form>
      <section className={styles.settings} aria-label="Session settings">
        <label><input type="checkbox" checked={snapshot?.settings.demoMode ?? false}
          onChange={(event) => { void setDemoMode(event.target.checked) }} /> Demo timing</label>
        <label><input type="checkbox" checked={snapshot?.settings.showHud ?? false}
          onChange={(event) => { void command(() => getApi().setSettings({ showHud: event.target.checked }),
            'Could not change the status display.') }} /> Show live status</label>
      </section>
      <Permissions api={getApi()} snapshot={snapshot} />
      {snapshot?.settings.showHud && <DevHud snapshot={snapshot} />}
      <section className={styles.preview} aria-label="Overlay preview">
        <div className={styles.previewHeader}><strong>Overlay preview</strong><span>Development</span></div>
        <p>Cycle through the pill, check-in, arrow, next step, captions, and session states. Buttons simulate their actions.</p>
        <div className={styles.previewActions}>
          <button type="button" disabled={!snapshot || previewBusy} onClick={() => { void previewOverlay('next') }}>Next overlay preview</button>
          <button type="button" disabled={!snapshot || previewBusy || snapshot.overlayPreview === 'hidden'}
            onClick={() => { void previewOverlay('hide') }}>Hide overlay</button>
        </div>
        <p role="status" className={styles.previewStatus}>Showing: {snapshot?.overlayPreview ?? 'hidden'}
          {snapshot?.stats.logs.at(-1)?.startsWith('Overlay preview:') && ` · ${snapshot.stats.logs.at(-1)}`}</p>
      </section>
      <aside className={styles.note}>
        <strong>Your space, your pace.</strong>
        <p>You can pause any time with ⌘⇧P. Toggle voice with ⌘⇧Space, or use the on-screen buttons.</p>
      </aside>
      <footer className={styles.footer}>
        <span>Desktop connection: {snapshot ? 'ready' : 'loading'}</span>
        <span>{snapshot?.state === 'SETUP' ? 'Task ready to lock' : snapshot?.state ?? 'Ready when you are'}</span>
      </footer>
    </main>
  )
}
