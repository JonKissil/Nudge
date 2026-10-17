import type { ControlApi } from '../../shared/bridge'
import type { SessionSnapshot, Theme } from '../../shared/types'
import { LANGUAGE_CODES, LANGUAGE_NATIVE_NAMES, type LanguageCode } from '../../shared/languages'
import { DevHud } from './DevHud'
import { Permissions } from './Permissions'
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
  const themes: Array<{ id: Theme; name: string; detail: string }> = [
    { id: 'pixelated', name: 'Pixelated', detail: 'Retro focus' },
    { id: 'minimalist', name: 'Minimalist', detail: 'Calm and clear' },
    { id: 'neo-brutalist', name: 'Neo-brutalist', detail: 'Bold contrast' },
    { id: 'playful', name: 'Playful', detail: 'A little companion' },
  ]
  return (
    <div className={styles.settingsPage}>
      <section className={styles.themeSection} aria-labelledby="theme-heading">
        <div className={styles.sectionHeading}>
          <strong id="theme-heading">Appearance</strong>
          <span>Choose your Nudge</span>
        </div>
        <div className={styles.themeGrid} role="group" aria-label="App theme">
          {themes.map((theme) => <button key={theme.id} type="button"
            className={styles.themeChoice} data-choice={theme.id}
            aria-pressed={snapshot?.settings.theme === theme.id}
            disabled={!snapshot || busy}
            onClick={() => { void command(() => api.setSettings({ theme: theme.id }), 'Could not save the theme.') }}>
            <span className={styles.themeSwatch} aria-hidden="true"><span /><span /><span /></span>
            <span className={styles.themeChoiceText}><strong>{theme.name}</strong><small>{theme.detail}</small></span>
            <span className={styles.themeCheck} aria-hidden="true">✓</span>
          </button>)}
        </div>
      </section>
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
