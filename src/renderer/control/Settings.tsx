import type { ControlApi } from '../../shared/bridge'
import type { SessionSnapshot } from '../../shared/types'
import { LANGUAGE_CODES, LANGUAGE_NATIVE_NAMES, type LanguageCode } from '../../shared/languages'
import { HABIT_EXPLANATIONS } from '../../shared/habits'
import { DevHud } from './DevHud'
import { Permissions } from './Permissions'
import { PrivacySettings } from './PrivacySettings'
import styles from './App.module.css'

interface SettingsProps {
  api: ControlApi
  snapshot?: SessionSnapshot
  busy: boolean
  active: boolean
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
  command: (action: () => Promise<{ ok: boolean; error?: string }>, failure: string) => Promise<void>
  setDemoMode: (enabled: boolean) => Promise<void>
}

export function Settings({ api, snapshot, busy, active, language, setLanguage, command, setDemoMode }: SettingsProps) {
  const [feedbackMessage, setFeedbackMessage] = useState('')
  return (
    <div className={styles.settingsPage}>
      <PrivacySettings key={JSON.stringify(snapshot?.settings.privacy)} snapshot={snapshot} busy={busy}
        save={async (privacy) => {
          let result: Awaited<ReturnType<typeof api.setSettings>> = { ok: false, error: 'Privacy settings could not be saved.' }
          await command(async () => { result = await api.setSettings({ privacy }); return result }, 'Privacy settings could not be saved.')
          return result
        }} />
      <section className={styles.card} aria-label="Conversation language">
        <label htmlFor="language">Language</label>
        <select id="language" className={styles.language} value={language} lang={language}
          onChange={(event) => setLanguage(event.target.value as LanguageCode)}
          disabled={!snapshot || busy || active || Boolean(snapshot.lockWindowAt)}>
          {LANGUAGE_CODES.map((code) => <option key={code} value={code} lang={code} dir="auto">
            {LANGUAGE_NATIVE_NAMES[code]}
          </option>)}
        </select>
      </section>
      <section className={styles.card} aria-label="Adaptive grace period">
        <label><input type="checkbox" disabled={!snapshot || busy || snapshot.settings.demoMode}
          checked={snapshot?.settings.adaptiveGrace !== false}
          onChange={(event) => { void command(() => api.setSettings({ adaptiveGrace: event.target.checked }),
            'Could not change adaptive timing.') }} /> Learn my grace period</label>
        <p>{snapshot?.settings.demoMode ? 'Demo timing stays at 15 seconds and does not learn.'
          : `Current grace: ${Math.round((snapshot?.stats.graceMs ?? 90_000) / 1000)} seconds. Changes apply to your next session.`}</p>
        <p>Uses your recent unprompted returns to the task.</p>
        <label><input type="checkbox" disabled={!snapshot || busy || snapshot.settings.demoMode || snapshot.settings.adaptiveGrace === false}
          checked={snapshot?.settings.geminiGrace !== false}
          onChange={(event) => { void command(() => api.setSettings({ geminiGrace: event.target.checked }),
            'Could not change Gemini timing reviews.') }} /> Let Gemini refine my timing</label>
        <p>Shares numeric timing summaries and your feedback with Gemini. Timing history stays on this Mac;
          it contains no screen images, audio, task text, or page addresses.</p>
        {snapshot?.settings.adaptiveGrace !== false && snapshot?.settings.geminiGrace !== false && !snapshot?.settings.demoMode
          && <p>Next session: {Math.round((snapshot?.stats.nextGraceMs ?? 90_000) / 1000)} seconds.
            {' '}{snapshot?.stats.habitProfile ? HABIT_EXPLANATIONS[snapshot.stats.habitProfile.reason]
              : 'Gemini reviews begin after enough history is available.'}</p>}
        <div className={styles.previewActions}>
          {(['sooner', 'more-time'] as const).map((preference) => <button key={preference} type="button"
            disabled={!snapshot || busy || !['FOCUSED', 'DRIFTING', 'CHECKIN', 'SNOOZED'].includes(snapshot.state)
              || snapshot.settings.demoMode || snapshot.settings.adaptiveGrace === false || snapshot.settings.geminiGrace === false}
            onClick={() => { void command(async () => {
              const result = await api.recordTimingFeedback({ preference })
              if (result.ok) setFeedbackMessage('Saved for your next timing review.')
              return result
            }, 'Could not save timing feedback.') }}>
            {preference === 'sooner' ? 'Check in sooner' : 'Give me more time'}
          </button>)}
        </div>
        {feedbackMessage && <p role="status">{feedbackMessage}</p>}
        <button type="button" disabled={!snapshot || busy || (!snapshot.stats.graceSamples && !snapshot.stats.habitEvents && !snapshot.stats.habitProfile)}
          onClick={() => { void command(async () => {
            const result = await api.resetGraceHistory()
            if (result.ok) setFeedbackMessage('')
            return result
          }, 'Could not reset learned timing.') }}>Reset learned timing</button>
      </section>
      {active && <section className={styles.card} aria-label="Current session">
        <strong>Current session</strong>
        <p role="status">{snapshot?.state} · {snapshot?.taskWindow?.title ?? 'Task window locked'}</p>
        <div className={styles.previewActions}>
          <button type="button" disabled={busy}
            onClick={() => { void command(() => api.togglePause(), 'Could not change pause state.') }}>
            {snapshot?.state === 'PAUSED' ? 'Resume session' : 'Pause session'}
          </button>
          <button type="button" disabled={busy}
            onClick={() => { void command(() => api.endSession(), 'Could not end the session.') }}>End session</button>
        </div>
      </section>}
      <section className={styles.settings} aria-label="Session settings">
        <label><input type="checkbox" disabled={!snapshot || busy} checked={snapshot?.settings.demoMode ?? false}
          onChange={(event) => { void setDemoMode(event.target.checked) }} /> Demo timing</label>
        <label><input type="checkbox" disabled={!snapshot || busy} checked={snapshot?.settings.showHud ?? false}
          onChange={(event) => { void command(() => api.setSettings({ showHud: event.target.checked }),
            'Could not change the status display.') }} /> Show live status</label>
      </section>
      <Permissions api={api} snapshot={snapshot} />
      {snapshot?.settings.showHud && <DevHud snapshot={snapshot} />}
      <section className={styles.preview} aria-label="Overlay preview">
        <div className={styles.previewHeader}><strong>Overlay preview</strong><span>Development</span></div>
        <div className={styles.previewActions}>
          <button type="button" disabled={!snapshot || busy}
            onClick={() => { void command(() => api.previewOverlay('next'), 'Could not update the overlay preview.') }}>
            Next overlay preview
          </button>
          <button type="button" disabled={!snapshot || busy || snapshot.overlayPreview === 'hidden'}
            onClick={() => { void command(() => api.previewOverlay('hide'), 'Could not hide the overlay preview.') }}>
            Hide overlay
          </button>
        </div>
        <p role="status" className={styles.previewStatus}>Showing: {snapshot?.overlayPreview ?? 'hidden'}
          {snapshot?.stats.logs.at(-1)?.startsWith('Overlay preview:') && ` · ${snapshot.stats.logs.at(-1)}`}</p>
      </section>
      <section className={styles.shortcuts} aria-label="Keyboard shortcuts">
        <strong>Keyboard shortcuts</strong>
        <dl>
          <div><dt>Pause / resume</dt><dd>⌘⇧P</dd></div>
          <div><dt>Toggle microphone</dt><dd>⌘⇧Space</dd></div>
          <div><dt>Toggle live status</dt><dd>⌘⇧D</dd></div>
        </dl>
      </section>
      <footer className={styles.footer}>
        <span>Desktop connection: {snapshot ? 'ready' : 'loading'}</span>
        <span>{snapshot?.state ?? 'Loading'}</span>
      </footer>
    </div>
  )
}
import { useState } from 'react'
