import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ControlApi } from '../../shared/bridge'
import type { SessionSnapshot } from '../../shared/types'
import styles from './App.module.css'
import { DevHUD } from './DevHUD'

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
  const [now, setNow] = useState(Date.now())
  const active = snapshot?.state === 'FOCUSED' || snapshot?.state === 'PAUSED'

  useEffect(() => {
    if (!snapshot?.lockWindowAt) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [snapshot?.lockWindowAt])
  const [previewBusy, setPreviewBusy] = useState(false)

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

  async function command(action: () => ReturnType<ControlApi['endSession']>): Promise<void> {
    setBusy(true); setError('')
    try { const result = await action(); if (!result.ok) setError(result.error) }
    catch { setError('The action could not be completed. Please try again.') }
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

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}><span className={styles.mark} aria-hidden="true">↗</span> Nudge</span>
        <span className={styles.badge}>Early build · M2</span>
      </header>
      <p className={styles.eyebrow}>A LITTLE COMPANY FOR YOUR FOCUS</p>
      <h1>One thing at a time.</h1>
      <p className={styles.intro}>Make a little space for what you want to work on. We’ll start with one task.</p>
      <form className={styles.card} onSubmit={(event) => { void submit(event) }}>
        <label htmlFor="task">What are you working on?</label>
        <textarea id="task" value={task} onChange={(event) => setTask(event.target.value)}
          placeholder="An essay, a problem set, a little reading…" required maxLength={1000} rows={3} disabled={active} />
        <label htmlFor="minutes">How long would you like?</label>
        <div className={styles.duration}>
          <input id="minutes" type="number" min={1} max={240} required value={minutes} disabled={active}
            onChange={(event) => setMinutes(event.target.valueAsNumber)} />
          <span>minutes</span>
        </div>
        {!active && <button type="submit" disabled={!snapshot || busy || !task.trim() || Boolean(snapshot.lockWindowAt)}>Save task <span aria-hidden="true">↗</span></button>}
        {snapshot?.state === 'SETUP' && <>
          <button type="button" disabled={busy || Boolean(snapshot.lockWindowAt)}
            onClick={() => { void command(() => getApi().lockTaskWindow()) }}>Lock task window</button>
          <p role="status" className={styles.saved}>{snapshot.lockWindowAt
            ? `Switch to your task window · ${Math.max(0, Math.ceil((snapshot.lockWindowAt - now) / 1000)) || 'Locking…'}`
            : 'You’ll have 3 seconds to switch to your document. Capture starts after it’s locked.'}</p>
          {snapshot.lockError && <p role="alert" className={styles.error}>{snapshot.lockError}</p>}
        </>}
        {active && <>
          <p className={styles.saved}>Task window: <strong>{snapshot?.taskWindow?.title}</strong></p>
          <div className={styles.sessionActions}>
            <button type="button" disabled={busy} onClick={() => { void command(() => getApi().setCaptureRunning(snapshot?.state === 'PAUSED')) }}>
              {snapshot?.state === 'PAUSED' ? 'Resume capture' : 'Pause capture'}</button>
            <button type="button" disabled={busy} onClick={() => { void command(() => getApi().endSession()) }}>End session</button>
          </div>
        </>}
        {snapshot?.stats.capture?.error && <p role="alert" className={styles.error}>{snapshot.stats.capture.error}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </form>
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
        <p>{active ? 'Screen perception is ready. Voice check-ins arrive in the next milestones.'
          : 'Save a task, then lock its window to start screen perception. You can pause or end capture at any time.'}</p>
      </aside>
      <button type="button" className={styles.hudToggle} disabled={!snapshot || busy}
        onClick={() => { void command(() => getApi().setSettings({ showHud: !snapshot?.settings.showHud })) }}>
        {snapshot?.settings.showHud ? 'Hide developer HUD' : 'Show developer HUD'}</button>
      {snapshot?.settings.showHud && <DevHUD snapshot={snapshot} />}
      <footer className={styles.footer}>
        <span>Desktop connection: {snapshot ? 'ready' : 'loading'}</span>
        <span>{snapshot?.stats.capture?.state === 'running' ? 'Screen capture on' : 'Screen capture off'}</span>
      </footer>
    </main>
  )
}
