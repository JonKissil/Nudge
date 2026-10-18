import { useState } from 'react'
import { defaultPrivacySettings, PrivacySettingsSchema, PRIVACY_MESSAGES, type PrivacySettings as PrivacyConfig } from '../../shared/privacy'
import type { ActionResult, SessionSnapshot } from '../../shared/types'
import styles from './App.module.css'

const listFields = ['approvedApps', 'approvedDomains', 'excludedApps', 'excludedDomains'] as const
const labels = { approvedApps: 'Approved apps', approvedDomains: 'Approved sites', excludedApps: 'Excluded apps', excludedDomains: 'Excluded sites' }
const splitList = (value: string): string[] => [...new Set(value.split(/[\n,]/u).map((item) => item.trim()).filter(Boolean))]

export function PrivacySettings({ snapshot, busy, save }: {
  snapshot?: SessionSnapshot; busy: boolean; save(settings: PrivacyConfig): Promise<ActionResult>
}) {
  const [draft, setDraft] = useState(snapshot?.settings.privacy ?? defaultPrivacySettings())
  const [lists, setLists] = useState(() => Object.fromEntries(listFields.map((field) => [field, draft[field].join('\n')])) as Record<typeof listFields[number], string>)
  const [message, setMessage] = useState('')
  const submit = async (): Promise<void> => {
    const parsed = PrivacySettingsSchema.safeParse({ ...draft,
      ...Object.fromEntries(listFields.map((field) => [field, splitList(lists[field])])),
    })
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? 'Check your privacy settings.'); return }
    const result = await save(parsed.data)
    setMessage(result.ok ? 'Privacy settings saved.' : result.error)
  }
  return <section className={styles.card} aria-label="Privacy">
    <strong>Privacy</strong>
    <p role="status">{snapshot?.privacy ? PRIVACY_MESSAGES[snapshot.privacy.reason] : 'Sharing has not started'}</p>
    <p>Only the captured window is shared. Locking a task approves that task; exclusions always take priority.</p>
    <label><input type="checkbox" checked={draft.approvedOnly} disabled={busy}
      onChange={(event) => setDraft({ ...draft, approvedOnly: event.target.checked })} /> Only share approved sources</label>
    <label><input type="checkbox" checked={draft.shareBrowserContent} disabled={busy}
      onChange={(event) => setDraft({ ...draft, shareBrowserContent: event.target.checked })} /> Share browser content</label>
    <p>Browser sharing includes the visible tab in an approved window. Site exclusions cannot catch every rapid
      tab switch. Leave this off to withhold browser images, document text, and microphone input.</p>
    <div className={styles.privacyLists}>{listFields.map((field) => <label key={field}>
      {labels[field]}<textarea value={lists[field]} disabled={busy} aria-label={labels[field]}
        placeholder={field.endsWith('Apps') ? 'TextEdit\nOne app name or bundle ID per line' : 'example.com\nOne hostname per line'}
        onChange={(event) => setLists({ ...lists, [field]: event.target.value })} />
    </label>)}</div>
    <p>App approvals cover all its windows; site approvals cover that hostname and its subdomains.
      When approved sources is off, other windows may be shared unless excluded.</p>
    <strong>Hidden screen areas</strong>
    <p>Areas are percentages of the primary display. Black masks apply before images or document text leave this Mac.</p>
    {draft.masks.map((mask, index) => <fieldset key={index} className={styles.privacyMask}>
      <legend>Hidden area {index + 1}</legend>
      {(['x', 'y', 'w', 'h'] as const).map((field) => <label key={field}>
        {{ x: 'Left', y: 'Top', w: 'Width', h: 'Height' }[field]} (%)
        <input type="number" min={field === 'w' || field === 'h' ? 1 : 0} max={100} step={1} disabled={busy}
          value={Math.round(mask[field] * 100)} onChange={(event) => setDraft({ ...draft,
            masks: draft.masks.map((item, i) => i === index ? { ...item, [field]: Number(event.target.value) / 100 } : item),
          })} />
      </label>)}
      <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, masks: draft.masks.filter((_, i) => i !== index) })}>Remove area</button>
    </fieldset>)}
    <button type="button" disabled={busy || draft.masks.length >= 20}
      onClick={() => setDraft({ ...draft, masks: [...draft.masks, { x: 0, y: 0, w: 0.2, h: 0.2 }] })}>Add hidden area</button>
    <p>Common credentials and identifiers are filtered from text. Images can contain private information outside hidden areas.
      Pause Nudge before viewing anything you do not want shared. Settings changes cannot recall anything already sent.</p>
    <button type="button" disabled={!snapshot || busy} onClick={() => { void submit() }}>Save privacy settings</button>
    {message && <p role="status">{message}</p>}
  </section>
}
