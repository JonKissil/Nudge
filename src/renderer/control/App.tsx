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
<<<<<<< HEAD
  const [previewBusy, setPreviewBusy] = useState(false)
=======
>>>>>>> f5bb2fc (Scaffold)

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

<<<<<<< HEAD
  async function previewOverlay(action: 'next' | 'hide'): Promise<void> {
    setPreviewBusy(true)
    setError('')
    try {
      const result = await getApi().previewOverlay(action)
      if (!result.ok) setError(result.error)
    } catch { setError('Could not update the overlay preview. Please try again.') }
    finally { setPreviewBusy(false) }
  }

<<<<<<< Updated upstream
=======
>>>>>>> f5bb2fc (Scaffold)
=======
  async function changeSetting(setting: 'demoMode' | 'showHud', enabled: boolean): Promise<void> {
    setError('')
    try {
      const result = await getApi().setSettings({ [setting]: enabled })
      if (!result.ok) setError(result.error)
      else if (setting === 'demoMode' && enabled && snapshot?.state === 'IDLE') {
        setTask(DEMO_TASK)
        setMinutes(30)
      }
    } catch { setError('Could not update this setting. Please try again.') }
  }

>>>>>>> Stashed changes
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}><span className={styles.mark} aria-hidden="true">↗</span> Nudge</span>
<<<<<<< Updated upstream
<<<<<<< HEAD
        <span className={styles.badge}>Early build · M1</span>
=======
        <span className={styles.badge}>Early build · M0</span>
>>>>>>> f5bb2fc (Scaffold)
=======
        <span className={styles.badge}>Early build</span>
>>>>>>> Stashed changes
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
        <button type="submit" disabled={!snapshot || busy || !task.trim()}>Save task <span aria-hidden="true">↗</span></button>
        {snapshot?.state === 'SETUP' && <p role="status" className={styles.saved}>Task saved. Window locking is coming next.</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </form>
<<<<<<< Updated upstream
<<<<<<< HEAD
=======
      <section className={styles.settings} aria-label="Session settings">
        <label><input type="checkbox" checked={snapshot?.settings.demoMode ?? false}
          onChange={(event) => { void changeSetting('demoMode', event.target.checked) }} /> Demo mode</label>
        <label><input type="checkbox" checked={snapshot?.settings.showHud ?? false}
          onChange={(event) => { void changeSetting('showHud', event.target.checked) }} /> Show live status</label>
        <p>Voice: ⌘⇧Space · Pause: ⌘⇧P · Live status: ⌘⇧D</p>
      </section>
      {snapshot?.settings.showHud && <DevHud snapshot={snapshot} />}
      <Permissions api={getApi()} />
>>>>>>> Stashed changes
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
=======
>>>>>>> f5bb2fc (Scaffold)
      <aside className={styles.note}>
        <strong>Your space, your pace.</strong>
        <p>The live study flow is being connected. For now, you can save a task, preview the overlay, and check permissions.</p>
      </aside>
      <footer className={styles.footer}>
        <span>Desktop connection: {snapshot ? 'ready' : 'loading'}</span>
        <span>{snapshot?.state === 'SETUP' ? 'Task ready' : 'Ready when you are'}</span>
      </footer>
    </main>
  )
}
