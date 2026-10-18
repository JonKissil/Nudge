import { describe, expect, it, vi } from 'vitest'
import { defaultPrivacySettings, PrivacySettingsSchema } from '../src/shared/privacy'
import { domainMatches, sanitizeText, sanitizeWindow, sharingDecision } from '../src/main/privacy/policy'
import { PrivacyController } from '../src/main/privacy/controller'
import { createStudyState, reduce } from '../src/main/session/stateMachine'

const task = { app: 'TextEdit', bundleId: 'com.apple.TextEdit', id: 42, ownerPid: 1234, title: 'PRIVATE_TITLE',
  bounds: { x: 100, y: 100, width: 800, height: 500 } }
const browser = { ...task, app: 'Safari', bundleId: 'com.apple.Safari', url: 'https://docs.example.test/private?token=SECRET#PRIVATE' }

describe('local privacy policy', () => {
  it('fails closed, approves the locked task, and keeps exclusions stronger than approvals', () => {
    const config = defaultPrivacySettings()
    expect(sharingDecision(task, task, config)).toBe('sharing')
    expect(sharingDecision(undefined, task, config)).toBe('unknown')
    expect(sharingDecision({ ...task, id: undefined }, task, config)).toBe('unknown')
    expect(sharingDecision(task, task, config, 1234)).toBe('unknown')
    expect(sharingDecision({ ...task, bundleId: 'other', app: 'Other' }, task, config)).toBe('unapproved')
    expect(sharingDecision(task, task, { ...config, excludedApps: ['com.apple.TextEdit'], approvedApps: ['TextEdit'] })).toBe('excluded-app')
    expect(sharingDecision(browser, browser, config)).toBe('browser-disabled')
    expect(sharingDecision(browser, browser, { ...config, shareBrowserContent: true, excludedDomains: ['example.test'] })).toBe('excluded-site')
    expect(sharingDecision({ ...browser, url: undefined }, browser, { ...config, shareBrowserContent: true })).toBe('unknown')
    expect(domainMatches(['example.test'], 'notexample.test')).toBe(false)
    expect(domainMatches(['example.test'], 'example.test.evil.test')).toBe(false)
  })
  it('keeps browser sharing off unless explicitly enabled and validates bounded rules and masks', () => {
    const config = { ...defaultPrivacySettings(), shareBrowserContent: true, approvedDomains: ['example.test'] }
    expect(sharingDecision(browser, undefined, config)).toBe('sharing')
    expect(PrivacySettingsSchema.safeParse({ ...config, excludedDomains: ['https://example.test/private'] }).success).toBe(false)
    expect(PrivacySettingsSchema.safeParse({ ...config, excludedDomains: ['*.example.test'] }).success).toBe(false)
    expect(PrivacySettingsSchema.safeParse({ ...config, masks: [{ x: 0.9, y: 0, w: 0.2, h: 0.2 }] }).success).toBe(false)
  })
  it('removes titles, URL paths/query/fragments, and common credentials and identifiers from model text', () => {
    expect(sanitizeWindow(browser)).toMatchObject({ title: '[Window title withheld]', url: 'https://docs.example.test' })
    const sanitized = sanitizeText('Read https://example.test/private/PRIVATE_PATH?token=SECRET#FRAGMENT email person@example.com password=SECRET 123-45-6789 4111 1111 1111 1111')
    for (const secret of ['PRIVATE_PATH', 'SECRET', 'FRAGMENT', 'person@example.com', '123-45-6789', '4111 1111 1111 1111']) expect(sanitized).not.toContain(secret)
  })
  it('invalidates tokens on source/settings/unknown/pause changes and never falls back to a display source', () => {
    const changed = vi.fn()
    const controller = new PrivacyController({ task: () => task, changed })
    controller.observe(task)
    const revision = controller.state.revision
    const policy = controller.capturePolicy({ x: 0, y: 0, width: 1200, height: 800 }, 2)!
    expect(policy.windowId).toBe(42)
    expect(policy.masks[0]).toMatchObject({ h: 32 / 800 })
    controller.configure({ ...defaultPrivacySettings(), masks: [{ x: 0, y: 0, w: 0.5, h: 0.5 }] })
    expect(controller.current(revision)).toBe(false)
    controller.observe(undefined)
    expect(controller.capturePolicy(policy.display, 2)).toBeUndefined()
    controller.observe(task); controller.suspend()
    expect(controller.state.sharing).toBe(false)
    expect(controller.window).toBeUndefined()
  })
  it('keeps excluded task context private even when another approved app is foreground', () => {
    const controller = new PrivacyController({ task: () => browser, changed: () => {} })
    controller.configure({ ...defaultPrivacySettings(), shareBrowserContent: true,
      excludedDomains: ['example.test'], approvedApps: ['TextEdit'] })
    controller.observe(task)
    expect(controller.state).toMatchObject({ sharing: false, reason: 'excluded-site' })
    expect(controller.capturePolicy({ x: 0, y: 0, width: 1200, height: 800 }, 2)).toBeUndefined()
  })
  it('pauses timers without counting private activity and preserves snooze time and manual Pause', () => {
    let state = createStudyState()
    state = reduce(state, { type: 'START_SETUP', task: 'Essay', minutes: 5 }, 0).state
    state = reduce(state, { type: 'LOCK_WINDOW', window: task }, 0).state
    state = { ...state, phase: 'DRIFTING', driftSince: 0, checkPending: true }
    const held = reduce(state, { type: 'PRIVACY_HOLD' }, 1000)
    expect(held.state).toMatchObject({ phase: 'FOCUSED', privacyHeldAt: 1000, checkPending: false, driftSince: undefined })
    expect(reduce(held.state, { type: 'TICK' }, 999_999).effects).toEqual([])
    let snoozed = { ...state, phase: 'SNOOZED' as const, snoozeUntil: 100_000 }
    snoozed = reduce(snoozed, { type: 'PRIVACY_HOLD' }, 10_000).state as typeof snoozed
    expect(reduce(snoozed, { type: 'PRIVACY_RELEASE' }, 50_000).state.snoozeUntil).toBe(140_000)
    const paused = reduce(held.state, { type: 'PAUSE' }, 2000).state
    expect(reduce(paused, { type: 'PRIVACY_RELEASE' }, 3000).effects).toEqual([])
    expect(reduce(paused, { type: 'PRIVACY_RELEASE' }, 3000).state.phase).toBe('PAUSED')
  })
})
